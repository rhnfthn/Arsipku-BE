import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entity untuk tabel `sde_masal` di database utama Arsipku (MySQL).
 * Menyimpan data SDE (Surat Dinas Eksternal) yang dikirim secara masal
 * melalui upload file Excel.
 */
@Entity('sde_masal')
export class SdeMasalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_sde_masal_concept')
  @Column({ name: 'concept_id', type: 'char', length: 36, nullable: true })
  conceptId: string | null;

  @Column({ name: 'tanggal_konsep', type: 'date', nullable: true })
  tanggalKonsep: Date | null;

  @Column({ name: 'klasifikasi_id', type: 'char', length: 36, nullable: true })
  klasifikasiId: string | null;

  @Column({
    name: 'klasifikasi_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  klasifikasiName: string | null;

  @Column({ name: 'pengirim_id', type: 'varchar', length: 100, nullable: true })
  pengirimId: string | null;

  @Column({
    name: 'pengirim_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  pengirimName: string | null;

  @Column({ name: 'sifat_surat', type: 'varchar', length: 50, nullable: true })
  sifatSurat: string | null;

  @Column({
    name: 'skema_template',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  skemaTemplate: string | null;

  @Column({
    name: 'versi_template',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  versiTemplate: string | null;

  @Column({ type: 'varchar', length: 500 })
  perihal: string;

  @Column({ type: 'varchar', length: 500 })
  tertuju: string;

  @Column({ type: 'text', nullable: true })
  alamat: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  kota: string | null;

  @Column({ name: 'kode_pos', type: 'varchar', length: 10, nullable: true })
  kodePos: string | null;

  @Column({
    name: 'jabatan_penerima',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  jabatanPenerima: string | null;

  @Column({ name: 'isi_ringkasan', type: 'text', nullable: true })
  isiRingkasan: string | null;

  @Index('idx_sde_masal_status')
  @Column({
    name: 'status_verifikasi',
    type: 'varchar',
    length: 20,
    default: 'MENUNGGU',
  })
  statusVerifikasi: string;

  @Column({
    name: 'jenis_template',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  jenisTemplate: string | null;

  @Column({ name: 'lampiran_url', type: 'text', nullable: true })
  lampiranUrl: string | null;

  @Column({ name: 'original_file_url', type: 'text', nullable: true })
  originalFileUrl: string | null;

  @Column({
    name: 'parent_naskah_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  parentNaskahId: string | null;

  @Column({ name: 'naskah_id', type: 'char', length: 36, nullable: true })
  naskahId: string | null;

  @Column({ name: 'nomor_surat', type: 'varchar', length: 100, nullable: true })
  nomorSurat: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
