import {
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Berkas } from '../../berkas/entities/berkas.entity';

@Entity('berkas_verifikasi', { schema: 'navmail' })
@Index('idx_berkas_verifikasi_berkas', ['berkasId'])
@Index('idx_berkas_verifikasi_verifikator', ['verifikatorPersnum'])
@Index('idx_berkas_verifikasi_status', ['status'])
@Index('uk_berkas_verifikasi_urutan', ['berkasId', 'urutan', 'tanggal'], {
  unique: true,
})
export class BerkasVerifikasi {
  @PrimaryGeneratedColumn('uuid')
  @Column('char', { primary: true, name: 'id', length: 36 })
  id: string;

  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column('char', { name: 'berkas_id', length: 36 })
  berkasId: string;

  @Column('int', { name: 'urutan' })
  urutan: number;

  @Column('varchar', { name: 'verifikator_persnum', length: 50 })
  verifikatorPersnum: string;

  @Column('int', { name: 'verifikator_position_id', nullable: true })
  verifikatorPositionId: number;

  @Column('varchar', { name: 'jabatan_verifikator', length: 255, nullable: true })
  jabatanVerifikator: string;

  @Column('varchar', { name: 'status', length: 20, default: 'pending' })
  status: string;

  @Column('text', { name: 'catatan', nullable: true })
  catatan: string;

  @Column('datetime', { name: 'action_at', nullable: true })
  actionAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => Berkas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'berkas_id' })
  berkas: Berkas;
}
