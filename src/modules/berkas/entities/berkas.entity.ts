import {
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum HitungWaktuRetensiDari {
  SEJAK_BERKAS_DIBUAT = 'Sejak Berkas Dibuat',
  SEJAK_BERKAS_DITUTUP = 'Sejak Berkas Ditutup',
}

export enum TindakanPenyusutanAkhir {
  MUSNAH = 'Musnah',
  DINILAI_KEMBALI = 'Dinilai Kembali',
  PERMANEN = 'Permanen',
}

export enum StatusBerkas {
  DRAFT = 'draft',
  AKTIF = 'aktif',
  MENUNGGU_VERIFIKASI = 'menunggu_verifikasi',
  DITOLAK = 'ditolak',
  CLOSED_RETENSI_AKTIF = 'closed_retensi_aktif',
  RETAIL_INAKTIF = 'retensi_inaktif',
}

@Entity('berkas')
export class Berkas {
  @PrimaryGeneratedColumn('uuid')
  @Column('char', { primary: true, name: 'id', length: 36 })
  id: string;

  // ── Kolom Existing ──────────────────────────────────────────────

  @Column('varchar', { name: 'klasifikasi', length: 50 })
  klasifikasi: string;

  @Column('varchar', { name: 'klasifikasi_text', length: 255, nullable: true })
  klasifikasiTeks: string;

  @Column('varchar', { name: 'judul_berkas', length: 200 })
  judulBerkas: string;

  @Column({
    type: 'enum',
    name: 'hitung_waktu_retensi_dari',
    enum: HitungWaktuRetensiDari,
  })
  hitungWaktuRetensiDari: HitungWaktuRetensiDari;

  @Column({
    type: 'enum',
    name: 'tindakan_penyusutan_akhir',
    enum: TindakanPenyusutanAkhir,
  })
  tindakanPenyusutanAkhir: TindakanPenyusutanAkhir;

  @Column('varchar', { name: 'lokasi', length: 255 })
  lokasi: string;

  @Column('text', { name: 'isi_ringkas' })
  isiRingkas: string;

  @Column('boolean', { name: 'is_aktif', default: true })
  isAktif: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  // ── Kolom Baru — Arsip Dinamis Phase 1 ─────────────────────────

  @Index('uk_berkas_kode_berkas', ['kodeBerkas', 'tanggalDibuat'], {
    unique: true,
  })
  @Column('varchar', { name: 'kode_berkas', length: 100, nullable: true })
  kodeBerkas: string;

  @Column('varchar', { name: 'kategori_berkas', length: 100, nullable: true })
  kategoriBerkas: string;

  @Column('int', { name: 'retensi_aktif_tahun', nullable: true })
  retensiAktifTahun: number;

  @Column('int', { name: 'retensi_inaktif_tahun', nullable: true })
  retensiInaktifTahun: number;

  @Column('varchar', { name: 'foto_lokasi_fisik', length: 255, nullable: true })
  fotoLokasiFisik: string;

  @Column('varchar', { name: 'dokumen_pendukung', length: 255, nullable: true })
  dokumenPendukung: string;

  // Catatan/usulan pengusul saat mengajukan penutupan berkas
  @Column('text', { name: 'catatan_penutupan', nullable: true })
  catatanPenutupan: string | null;

  @Column('int', { name: 'unit_pencipta_id', nullable: true })
  unitPenciptaId: number;

  @Column('varchar', { name: 'pic_persnum', length: 50, nullable: true })
  picPersnum: string;

  @Column('int', { name: 'pic_position_id', nullable: true })
  picPositionId: number;

  @PrimaryColumn('date', { name: 'tanggal_dibuat' })
  tanggalDibuat: string;

  @Column('date', { name: 'tanggal_ditutup', nullable: true })
  tanggalDitutup: string;

  @Column('date', { name: 'tanggal_retensi_aktif_berakhir', nullable: true })
  tanggalRetensiAktifBerakhir: string;

  @Column('date', { name: 'tanggal_retensi_inaktif_berakhir', nullable: true })
  tanggalRetensiInaktifBerakhir: string;

  @Column('varchar', {
    name: 'status',
    length: 40,
    nullable: true,
    default: 'draft',
  })
  status: string;

  @Column('int', { name: 'created_by', nullable: true })
  createdBy: number;

  @Column('int', { name: 'updated_by', nullable: true })
  updatedBy: number;

  @Column('datetime', { name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
