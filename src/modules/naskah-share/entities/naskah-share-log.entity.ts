import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NaskahShareEntity } from './naskah-share.entity';
import { ShareLogAksi } from '../enums/share-log-aksi.enum';

@Entity('naskah_share_log')
export class NaskahShareLogEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'share_id', length: 36 })
  shareId: string;

  @Column('char', { name: 'naskah_id', length: 36 })
  naskahId: string;

  @Column('enum', { enum: ShareLogAksi })
  aksi: ShareLogAksi;

  @Column('int', { name: 'actor_persnum' })
  actorPersnum: number;

  @Column('varchar', { name: 'actor_nama', length: 150 })
  actorNama: string;

  @Column('varchar', {
    name: 'actor_position_text',
    length: 150,
    nullable: true,
  })
  actorPositionText: string | null;

  @Column('int', { name: 'recipient_persnum', nullable: true })
  recipientPersnum: number | null;

  @Column('varchar', { name: 'recipient_nama', length: 150, nullable: true })
  recipientNama: string | null;

  @Column('varchar', { name: 'catatan', length: 500, nullable: true })
  catatan: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => NaskahShareEntity, (s) => s.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'share_id' })
  share: NaskahShareEntity;
}
