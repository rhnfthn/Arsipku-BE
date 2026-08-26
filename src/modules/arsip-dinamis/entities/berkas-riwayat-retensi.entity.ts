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

@Entity('berkas_riwayat_retensi')
@Index('idx_berkas_retensi_berkas', ['berkasId'])
@Index('idx_berkas_retensi_tanggal', ['tanggalPerubahan'])
export class BerkasRiwayatRetensi {
  @PrimaryGeneratedColumn('uuid')
  @Column('char', { primary: true, name: 'id', length: 36 })
  id: string;

  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column('char', { name: 'berkas_id', length: 36 })
  berkasId: string;

  @Column('varchar', { name: 'status_sebelumnya', length: 40 })
  statusSebelumnya: string;

  @Column('varchar', { name: 'status_baru', length: 40 })
  statusBaru: string;

  @Column('date', { name: 'tanggal_perubahan' })
  tanggalPerubahan: string;

  @Column('int', { name: 'diproses_oleh' })
  diprosesOleh: number;

  @Column('text', { name: 'keterangan', nullable: true })
  keterangan: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => Berkas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'berkas_id' })
  berkas: Berkas;
}
