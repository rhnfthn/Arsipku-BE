import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entity master snapshot berkas inaktif di database arsipku_arsip_local.
 */
@Entity('arsip_berkas')
export class ArsipBerkasEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'smallint', unsigned: true })
  archived_year: number;

  @Column({ type: 'char', length: 36, nullable: false })
  source_berkas_id: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  klasifikasi: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  klasifikasi_text: string | null;

  @Column({ type: 'varchar', length: 200, nullable: false })
  judul_berkas: string;

  @Column({ type: 'text', nullable: false })
  isi_ringkas: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kode_berkas: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kategori_berkas: string | null;

  @Column({ type: 'varchar', length: 50, nullable: false })
  hitung_waktu_retensi_dari: string;

  @Column({ type: 'int', nullable: true })
  retensi_aktif_tahun: number | null;

  @Column({ type: 'int', nullable: true })
  retensi_inaktif_tahun: number | null;

  @Column({ type: 'varchar', length: 20, nullable: false })
  tindakan_penyusutan_akhir: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lokasi_fisik: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  foto_lokasi_fisik: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  dokumen_pendukung: string | null;

  @Column({ type: 'text', nullable: true })
  catatan_penutupan: string | null;

  @Column({ type: 'int', nullable: true })
  unit_pencipta_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  unit_pencipta_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  pic_persnum: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pic_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pic_position_text: string | null;

  @Column({ type: 'date', nullable: false })
  tanggal_dibuat: string;

  @Column({ type: 'date', nullable: true })
  tanggal_ditutup: string | null;

  @Column({ type: 'date', nullable: true })
  tanggal_retensi_aktif_berakhir: string | null;

  @Column({ type: 'date', nullable: true })
  tanggal_retensi_inaktif_berakhir: string | null;

  @Column({ type: 'date', nullable: false })
  tanggal_masuk_arsip: string;

  @Column({ type: 'varchar', length: 40, nullable: false, default: 'inaktif' })
  status_akhir: string;

  @Column({ type: 'boolean', nullable: false, default: false })
  is_musnah: boolean;

  @Column({ type: 'date', nullable: true })
  tanggal_pemusnahan: string | null;

  @Column({ type: 'int', nullable: true })
  musnah_by_persnum: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  musnah_by_name: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  berita_acara_pemusnahan_url: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  foto_dokumentasi_pemusnahan: string | null;

  @Column({ type: 'text', nullable: true })
  catatan_pemusnahan: string | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  @Column({ type: 'datetime', nullable: true })
  deleted_at: Date | null;
}
