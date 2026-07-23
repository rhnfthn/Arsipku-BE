import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { NaskahShareRecipientEntity } from './naskah-share-recipient.entity';
import { NaskahShareLogEntity } from './naskah-share-log.entity';
import { ShareStatus } from '../enums/share-status.enum';

@Entity('naskah_share')
export class NaskahShareEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'naskah_id', length: 36 })
  naskahId: string;

  @Column('varchar', { name: 'pemberi_id', length: 100 })
  pemberiId: string;

  @Column('int', { name: 'pemberi_persnum' })
  pemberiPersnum: number;

  @Column('varchar', { name: 'pemberi_nama', length: 150 })
  pemberiNama: string;

  @Column('varchar', { name: 'pemberi_position_text', length: 150, nullable: true })
  pemberiPositionText: string | null;

  @Column('varchar', { name: 'catatan', length: 500, nullable: true })
  catatan: string | null;

  @Column('enum', { enum: ShareStatus, default: ShareStatus.AKTIF })
  status: ShareStatus;

  @Column('timestamp', { name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column('varchar', { name: 'revoked_reason', length: 500, nullable: true })
  revokedReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => NaskahShareRecipientEntity, (r) => r.share)
  recipients: NaskahShareRecipientEntity[];

  @OneToMany(() => NaskahShareLogEntity, (l) => l.share)
  logs: NaskahShareLogEntity[];
}
