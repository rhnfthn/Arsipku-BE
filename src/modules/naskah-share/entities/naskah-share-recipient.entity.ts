import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NaskahShareEntity } from './naskah-share.entity';
import { RecipientStatus } from '../enums/recipient-status.enum';
import { ReopenRequestStatus } from '../enums/reopen-request-status.enum';

@Entity('naskah_share_recipient')
export class NaskahShareRecipientEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'share_id', length: 36 })
  shareId: string;

  @Column('varchar', { name: 'recipient_id', length: 100 })
  recipientId: string;

  @Column('int', { name: 'recipient_persnum' })
  recipientPersnum: number;

  @Column('varchar', { name: 'recipient_nama', length: 150 })
  recipientNama: string;

  @Column('varchar', {
    name: 'recipient_position_text',
    length: 150,
    nullable: true,
  })
  recipientPositionText: string | null;

  @Column('varchar', {
    name: 'recipient_org_text',
    length: 150,
    nullable: true,
  })
  recipientOrgText: string | null;

  @Column('enum', {
    enum: RecipientStatus,
    default: RecipientStatus.TERKIRIM,
  })
  status: RecipientStatus;

  @Column('timestamp', { name: 'opened_at', nullable: true })
  openedAt: Date | null;

  // Request akses ulang (khusus SEKALI_LIHAT yang sudah BERAKHIR)
  @Column('timestamp', { name: 'requested_at', nullable: true })
  requestedAt: Date | null;

  @Column('enum', {
    enum: ReopenRequestStatus,
    name: 'request_status',
    nullable: true,
  })
  requestStatus: ReopenRequestStatus | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => NaskahShareEntity, (s) => s.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'share_id' })
  share: NaskahShareEntity;
}
