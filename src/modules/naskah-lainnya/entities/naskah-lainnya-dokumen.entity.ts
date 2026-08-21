import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Dokumen pendukung / naskah fisik / dokumen tambahan untuk naskah-lainnya.
 * Tipe: 'naskah_fisik' | 'pendukung'
 * (naskah utama tetap di naskah.lampiran, blanko verbal di naskah_lainnya_blanko)
 */
@Entity('naskah_lainnya_dokumen')
@Index('idx_nld_naskah', ['naskahId'])
export class NaskahLainnyaDokumenEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'naskah_id', length: 36 })
  naskahId: string;

  @Column('varchar', { length: 32 })
  tipe: string; // 'naskah' | 'naskah_fisik' | 'pendukung'

  @Column('varchar', { length: 255 })
  nama: string; // nama file asli

  @Column('varchar', { name: 'minio_key', length: 255 })
  minioKey: string; // MinIO object key

  @Column('varchar', { length: 100, nullable: true })
  mimetype: string | null;

  @Column('bigint', { nullable: true })
  ukuran: number | null; // bytes

  // Versi naskah (hanya untuk tipe='naskah'); NULL untuk naskah_fisik/pendukung.
  @Column('varchar', { length: 32, nullable: true })
  tahapan: string | null;

  @Column('varchar', { name: 'uploader_nama', length: 255, nullable: true })
  uploaderNama: string | null;

  @Column('varchar', { name: 'uploader_jabatan', length: 255, nullable: true })
  uploaderJabatan: string | null;

  @Column('int', { name: 'uploader_persnum', nullable: true })
  uploaderPersnum: number | null;

  @Column('varchar', { length: 16, nullable: true })
  status: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}