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
  tipe: string; // 'naskah_fisik' | 'pendukung'

  @Column('varchar', { length: 255 })
  nama: string; // nama file asli

  @Column('varchar', { name: 'minio_key', length: 255 })
  minioKey: string; // MinIO object key

  @Column('varchar', { length: 50, nullable: true })
  mimetype: string | null;

  @Column('bigint', { nullable: true })
  ukuran: number | null; // bytes

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}