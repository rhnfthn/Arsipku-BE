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

@Entity('berkas_naskah', { schema: 'navmail' })
@Index('idx_berkas_naskah_berkas', ['berkasId'])
@Index('idx_berkas_naskah_naskah', ['naskahId'])
@Index('idx_berkas_naskah_sumber', ['sumber'])
@Index('uk_berkas_naskah', ['berkasId', 'naskahId', 'tanggal'], { unique: true })
export class BerkasNaskah {
  @PrimaryGeneratedColumn('uuid')
  @Column('char', { primary: true, name: 'id', length: 36 })
  id: string;

  @PrimaryColumn('date', { name: 'tanggal' })
  tanggal: Date;

  @Column('char', { name: 'berkas_id', length: 36 })
  berkasId: string;

  @Column('varchar', { name: 'naskah_id', length: 100 })
  naskahId: string;

  @Column('varchar', { name: 'naskah_tipe', length: 50 })
  naskahTipe: string;

  @Column('varchar', { name: 'sumber', length: 20 })
  sumber: string;

  @Column('varchar', { name: 'perihal', length: 255, nullable: true })
  perihal: string;

  @Column('varchar', { name: 'nomor_surat', length: 100, nullable: true })
  nomorSurat: string;

  @Column('date', { name: 'tanggal_naskah', nullable: true })
  tanggalNaskah: string;

  @Column('int', { name: 'urutan', default: 0 })
  urutan: number;

  @Column('int', { name: 'created_by' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => Berkas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'berkas_id' })
  berkas: Berkas;
}
