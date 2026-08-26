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

@Entity('berkas_naskah')
@Index('idx_berkas_naskah_berkas', ['berkasId'])
@Index('idx_berkas_naskah_naskah', ['naskahId'])
@Index('idx_berkas_naskah_sumber', ['sumber'])
@Index('uk_berkas_naskah', ['berkasId', 'naskahId', 'idSirkuler', 'tanggal'], {
  unique: true,
})
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

  // Konteks sirkulasi saat naskah ditambahkan — memungkinkan naskah yang sama
  // masuk ke berkas unit berbeda (penerima/pengirim), unique per id_sirkuler.
  @Column('enum', {
    name: 'sirkuler',
    enum: ['pengirim', 'penerima'],
    nullable: true,
  })
  sirkuler: 'pengirim' | 'penerima' | null;

  @Column('varchar', { name: 'id_sirkuler', length: 100, nullable: true })
  idSirkuler: string | null;

  // Status naskah dalam berkas: inaktif = berkas ditutup (retensi aktif habis),
  // disembunyikan dari user biasa, hanya TU (unit_dokumen) yang melihat/mengelola.
  @Column('enum', {
    name: 'status',
    enum: ['aktif', 'inaktif'],
    default: 'aktif',
  })
  status: 'aktif' | 'inaktif';

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
