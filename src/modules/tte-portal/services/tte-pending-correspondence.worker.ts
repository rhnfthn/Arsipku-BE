import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';
import { TteSigningService } from './tte-signing.service';
import { PORTAL_CORRESPONDENCE_TYPES } from './tte-correspondence-lifecycle.service';

@Injectable()
export class TtePendingCorrespondenceWorker {
  private running = false;
  private cursor: { createdAt: Date; id: string } | null = null;
  private readonly logger = new Logger(TtePendingCorrespondenceWorker.name);
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly signing: TteSigningService,
  ) {}

  @Cron('*/30 * * * * *')
  async reconcilePending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const query = this.dataSource
        .getRepository(TteSigningTransactionEntity)
        .createQueryBuilder('t')
        .innerJoin(
          'naskah',
          'n',
          "n.id = t.id_naskah AND n.status = 'pending_tte'",
        )
        .where('t.jenis_naskah IN (:...types)', {
          types: PORTAL_CORRESPONDENCE_TYPES,
        })
        .andWhere(
          'NOT EXISTS (SELECT 1 FROM tte_signing_transaction newer WHERE newer.id_naskah = t.id_naskah AND (newer.created_at > t.created_at OR (newer.created_at = t.created_at AND newer.id > t.id)))',
        )
        .orderBy('t.createdAt', 'ASC')
        .addOrderBy('t.id', 'ASC')
        .take(10);
      if (this.cursor)
        query.andWhere(
          '(t.created_at > :cursorTime OR (t.created_at = :cursorTime AND t.id > :cursorId))',
          { cursorTime: this.cursor.createdAt, cursorId: this.cursor.id },
        );
      const transactions = await query.getMany();
      const last = transactions[transactions.length - 1];
      this.cursor =
        transactions.length === 10 && last
          ? { createdAt: last.createdAt, id: last.id }
          : null;
      for (const transaction of transactions) {
        try {
          await this.signing.getTransactionStatus(
            transaction.id,
            transaction.userPersnum,
          );
        } catch {
          this.logger.warn(
            `Pending TTE reconciliation failed: ${transaction.id}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
