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

  // --- Field tambahan untuk template SDE Masal (data ASE) ---
  @Column({ name: 'id_tertuju', type: 'varchar', length: 100, nullable: true })
  idTertuju: string | null;

  @Column({ name: 'idramount', type: 'varchar', length: 100, nullable: true })
  idramount: string | null;

  @Column({ name: 'usdamount', type: 'varchar', length: 100, nullable: true })
  usdamount: string | null;

  @Column({ name: 'namacro', type: 'varchar', length: 255, nullable: true })
  namacro: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'tembusan', type: 'varchar', length: 500, nullable: true })
  tembusan: string | null;

  @Column({ name: 'is_revision', type: 'tinyint', default: 0 })
  isRevision: number;

  @Column({
    name: 'email_tertuju',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  emailTertuju: string | null;

  @Column({ name: 'email_cc', type: 'varchar', length: 500, nullable: true })
  emailCc: string | null;

  @Column({ name: 'email_bcc', type: 'varchar', length: 500, nullable: true })
  emailBcc: string | null;

  // --- Field skema keuangan / tagihan PINP ---
  @Column({
    name: 'jumlah_tagihan_idr',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  jumlahTagihanIdr: string | null;

  @Column({
    name: 'jumlah_tagihan_usd',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  jumlahTagihanUsd: string | null;

  @Column({ name: 'nama_cro', type: 'varchar', length: 255, nullable: true })
  namaCro: string | null;

  @Column({ name: 'email_cro', type: 'varchar', length: 255, nullable: true })
  emailCro: string | null;

  @Column({
    name: 'jabatan_signer',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  jabatanSigner: string | null;

  @Column({
    name: 'nama_signer',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  namaSigner: string | null;

  // --- Field skema umum / tagihan PJNP ---
  @Column({
    name: 'jumlah_lampiran',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  jumlahLampiran: string | null;

  @Column({
    name: 'alamat_penerima',
    type: 'text',
    nullable: true,
  })
  alamatPenerima: string | null;

  @Column({
    name: 'panggilan_penerima',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  panggilanPenerima: string | null;

  @Column({
    name: 'nominal_rupiah',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  nominalRupiah: string | null;

  @Column({
    name: 'nominal_dolar',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  nominalDolar: string | null;

  @Column({
    name: 'tembusan_1',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  tembusan1: string | null;

  @Column({
    name: 'tembusan_2',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  tembusan2: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
