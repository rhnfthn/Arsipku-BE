import {
  Entity,
  PrimaryColumn,
  Column,
} from 'typeorm';

@Entity('naskah')
export class NaskahEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('enum', {
    enum: ['ND', 'SDI', 'SDE', 'DI', 'KA', 'K'],
    comment:
      'Jenis dokumen: ND=Nota Dinas, SDI=Surat Dinas Internal, SDE=Surat Dinas Eksternal, DI=Disposisi Internal, KA=Korespondensi Aktif, K=Konsep (workflow tracking)',
  })
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K';

  @Column('varchar', { length: 50, nullable: true })
  klasifikasi: string;

  @Column('varchar', { length: 100, nullable: true })
  klasifikasi_text: string;

  @Column('enum', {
    enum: ['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka'],
    comment: 'Tingkat kerahasiaan dokumen',
  })
  sifat: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka';

  @Column('varchar', { length: 100, nullable: true })
  nomor: string | null;

  @Column('date')
  tanggal: Date;

  @Column('varchar', { length: 100, nullable: true })
  lampiran: string;

  @Column('text', { nullable: true })
  perihal: string;

  @Column('text', { nullable: true })
  konten: string;

  @Column('varchar', { length: 100, nullable: true })
  tempat: string;

  @Column('enum', {
    enum: ['draf', 'final', 'final_tte'],
    default: 'draf',
    comment:
      'Status dokumen: draf=sedang dibuat, final=final tanpa tandatangan, final_tte=final dengan tandatangan elektronik',
  })
  status: 'draf' | 'final' | 'final_tte';

  @Column('varchar', { length: 255, nullable: true })
  final_pdf: string;

  @Column('boolean', { default: false })
  english: boolean;

  @Column('char', { length: 36, nullable: true, comment: 'ID naskah konsep (jenis K) jika ini adalah naskah ND/SDI/SDE dari konsep' })
  id_naskah_konsep: string | null;

  @Column('char', { length: 36, nullable: true, comment: 'ID naskah ND/SDI/SDE jika ini adalah konsep workflow (jenis K)' })
  id_naskah_asli: string | null;

  // ============================================================================
  // KOLOM KONSOLIDASI DARI TABEL nd, sdi_sde, dan di
  // Ditambahkan untuk menghilangkan join ke tabel terpisah
  // ============================================================================

  // --- Kop Naskah ---
  @Column('varchar', { name: 'kop_logo', length: 255, nullable: true, comment: 'Logo kop surat' })
  kopLogo: string | null;

  @Column('varchar', { name: 'kop_nama', length: 150, nullable: true, comment: 'Nama kop surat' })
  kopNama: string | null;

  @Column('varchar', { name: 'kop_judul', length: 150, nullable: true, comment: 'Judul kop (untuk disposisi)' })
  kopJudul: string | null;

  @Column('text', { name: 'alamat_perusahaan', nullable: true, comment: 'Alamat perusahaan pada kop' })
  alamatPerusahaan: string | null;

  // --- Tempat ---
  @Column('varchar', { name: 'nama_tempat', length: 150, nullable: true, comment: 'Nama tempat/kota' })
  namaTempat: string | null;

  // --- Agenda (untuk Disposisi Internal) ---
  @Column('varchar', { name: 'nomor_agenda', length: 100, nullable: true, comment: 'Nomor agenda (untuk DI)' })
  nomorAgenda: string | null;

  @Column('date', { name: 'tanggal_agenda', nullable: true, comment: 'Tanggal agenda (untuk DI)' })
  tanggalAgenda: Date | null;

  @Column('varchar', { name: 'surat_dari', length: 150, nullable: true, comment: 'Surat dari (untuk DI)' })
  suratDari: string | null;

  // --- Penerima ---
  @Column('varchar', { name: 'kepada_yth', length: 255, nullable: true, comment: 'Kepada Yth' })
  kepadaYth: string | null;

  @Column('varchar', { name: 'dari', length: 150, nullable: true, comment: 'Dari/pengirim (untuk ND)' })
  dari: string | null;

  @Column('varchar', { name: 'nama_penerima', length: 150, nullable: true, comment: 'Nama penerima (untuk SDI/SDE)' })
  namaPenerima: string | null;

  @Column('text', { name: 'alamat_penerima', nullable: true, comment: 'Alamat penerima (untuk SDI/SDE)' })
  alamatPenerima: string | null;

  // --- Penandatangan ---
  @Column('varchar', { name: 'nama_jabatan', length: 150, nullable: true, comment: 'Nama jabatan penandatangan' })
  namaJabatan: string | null;

  @Column('varchar', { name: 'tanda_tangan', length: 255, nullable: true, comment: 'Path file tanda tangan' })
  tandaTangan: string | null;

  @Column('varchar', { name: 'nama_lengkap', length: 150, nullable: true, comment: 'Nama lengkap penandatangan' })
  namaLengkap: string | null;

  // --- Disposisi (untuk DI) ---
  @Column('text', { name: 'disposisi', nullable: true, comment: 'Isi disposisi (untuk DI)' })
  disposisi: string | null;

  @Column('text', { name: 'catatan', nullable: true, comment: 'Catatan (untuk DI)' })
  catatan: string | null;

  @Column('varchar', { name: 'paraf', length: 100, nullable: true, comment: 'Paraf (untuk DI)' })
  paraf: string | null;

  // --- Tembusan ---
  @Column('text', { name: 'tembusan', nullable: true, comment: 'Daftar tembusan' })
  tembusan: string | null;
}
