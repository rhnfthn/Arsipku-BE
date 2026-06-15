import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FaqKategoriEntity } from './faq-kategori.entity';

export enum FaqKategori {
  ARSIPKU = 'Arsipku',
  KOTAK_MASUK = 'Kotak Masuk',
  TULIS_SURAT = 'Tulis Surat',
  PENOMORAN = 'Penomoran',
  DOKUMEN_TEMPLATE = 'Dokumen & Template',
  TANDA_TANGAN_DIGITAL = 'Tanda Tangan Digital (BSrE)',
  MASTER_DATA = 'Master Data',
  PENGATURAN_AKUN = 'Pengaturan & Akun',
}

@Entity('faq')
export class FaqEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  pertanyaan: string;

  @Column({ type: 'text' })
  deskripsi: string;

  @Column({ type: 'char', length: 36, name: 'kategori_id' })
  kategoriId: string;

  @ManyToOne(() => FaqKategoriEntity, (kategori) => kategori.faqs)
  @JoinColumn({ name: 'kategori_id' })
  kategoriEntity: FaqKategoriEntity;

  @Column({ type: 'int', default: 0 })
  puas: number;

  @Column({ type: 'int', default: 0, name: 'tidak_puas' })
  tidakPuas: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
