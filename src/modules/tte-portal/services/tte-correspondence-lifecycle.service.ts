import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';
import { reservePortalCorrespondenceNumber } from '../helpers/portal-correspondence-number';

export const PORTAL_CORRESPONDENCE_TYPES = [
  'ND',
  'SDI',
  'SDE',
  'DI',
  'KA',
  'SDE_MASAL',
];

@Injectable()
export class TteCorrespondenceLifecycleService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async canReadPending(idNaskah: string, position: string): Promise<boolean> {
    const naskah = await this.dataSource
      .getRepository(NaskahEntity)
      .findOne({ where: { id: idNaskah } });
    if (!naskah || naskah.status !== 'pending_tte') return false;
    if (String(naskah.createdByPosition) === position) return true;
    return this.dataSource
      .getRepository(NaskahSirkulasi)
      .exists({ where: { idNaskah, position, sirkuler: 'pengirim' } });
  }

  async reconcile(transaction: TteSigningTransactionEntity): Promise<void> {
    if (
      !transaction.idNaskah ||
      !PORTAL_CORRESPONDENCE_TYPES.includes(transaction.jenisNaskah ?? '')
    )
      return;
    await this.dataSource.transaction(async (manager) => {
      const naskahRepo = manager.getRepository(NaskahEntity);
      const naskah = await naskahRepo.findOne({
        where: { id: transaction.idNaskah! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!naskah) return;
      const latest = await manager
        .getRepository(TteSigningTransactionEntity)
        .findOne({
          where: { idNaskah: naskah.id },
          order: { createdAt: 'DESC', id: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
      if (!latest || latest.id !== transaction.id) return;
      // A retry may commit its new reservation before its Portal transaction
      // is created. An old terminal attempt must not clear that new draft.
      if (naskah.nomor !== latest.nomorNaskah) return;
      const numbers = manager.getRepository(NomorRequestDetailEntity);
      if (latest.status === 'SIGNED') {
        if (
          latest.completedAt &&
          naskah.status === 'final_tte' &&
          naskah.nomor
        ) {
          await numbers.update(
            { nomor: naskah.nomor, status: 'booking' },
            { status: 'terpakai_final' },
          );
        }
        return;
      }
      if (naskah.status !== 'pending_tte') return;
      if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(latest.status)) {
        // Never erase a potentially signed document or a batch with partial success.
        if (
          latest.signedAt ||
          latest.signedFilePath ||
          latest.completedAt ||
          latest.completionProcessing ||
          (latest.errorCode === 'PREPARATION_FAILED' &&
            latest.uploadStatus === 'VERIFIED')
        )
          return;
        if (naskah.nomor)
          await numbers.update(
            { nomor: naskah.nomor, status: In(['booking', 'terpakai_final']) },
            { status: 'hangus' },
          );
        await naskahRepo.update(
          { id: naskah.id, tanggal: naskah.tanggal },
          {
            status: 'draf',
            nomor: null,
            final_pdf: () => 'NULL',
            tandaTangan: null,
          },
        );
        await manager
          .getRepository(NaskahSirkulasi)
          .update({ idNaskah: naskah.id }, { isDraft: true });
        return;
      }
      await reservePortalCorrespondenceNumber(manager, naskah.id);
    });
  }
}
