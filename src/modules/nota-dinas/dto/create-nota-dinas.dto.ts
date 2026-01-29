import { IsNotEmpty, IsArray, IsOptional, IsString, IsBoolean, IsEnum, ArrayMinSize, Matches } from 'class-validator';

// Enum untuk sifat surat
export enum SifatSurat {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

// Enum untuk opsi tanda tangan digital
export enum SignOption {
  DIGSIG = 'digsig',     // TTD Digital dengan BSrE + QR
  QR_ONLY = 'qr_only',   // Hanya QR tanpa BSrE
  NONE = 'none',         // Tanpa TTD dan QR
}

/**
 * DTO untuk Send Message Nota Dinas (ND)
 * Format flat - semua field dalam satu level
 */
export class CreateNotaDinasDto {
  // ============================================
  // SIRKULASI
  // ============================================
  @IsNotEmpty({ message: 'Pengirim (positionId) harus diisi' })
  pengirim: number; // positionId pengirim

  @IsArray({ message: 'Penerima harus berupa array positionId' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  penerima: number[]; // array positionId penerima

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array positionId tembusan (optional)

  // ============================================
  // KOP NASKAH (KEPALA)
  // ============================================
  @IsOptional()
  @IsString()
  kop_logo?: string; // URL/path logo perusahaan

  @IsOptional()
  @IsString()
  kop_nama?: string; // Nama perusahaan di kop

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string; // Alamat lengkap perusahaan

  // ============================================
  // DATA NASKAH (KEPALA + BATANG TUBUH)
  // ============================================
  @IsNotEmpty({ message: 'Klasifikasi harus diisi' })
  @IsString()
  klasifikasi: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsNotEmpty({ message: 'Sifat surat harus diisi' })
  @IsEnum(SifatSurat, { message: 'Sifat tidak valid' })
  sifat: SifatSurat;

  @IsNotEmpty({ message: 'Perihal harus diisi' })
  @IsString()
  perihal: string;

  @IsNotEmpty({ message: 'Konten harus diisi' })
  @IsString()
  konten: string; // Isi surat (pendahuluan, uraian, penutup)

  @IsOptional()
  @IsBoolean()
  english?: boolean; // true jika surat dalam bahasa Inggris

  // ============================================
  // KAKI SURAT
  // ============================================
  @IsOptional()
  @IsString()
  nama_tempat?: string; // e.g., "Tangerang" (auto dari org_data jika tidak diisi)

  @IsOptional()
  @IsString()
  nama_jabatan?: string; // e.g., "Direktur Utama" (auto dari pengirim jika tidak diisi)

  @IsOptional()
  @IsString()
  tanda_tangan?: string; // URL/path tanda tangan digital

  @IsOptional()
  @IsString()
  nama_lengkap?: string; // e.g., "John Doe" (auto dari pengirim jika tidak diisi)

  // ============================================
  // LAMPIRAN
  // ============================================
  @IsOptional()
  @IsString()
  lampiran?: string; // Keterangan lampiran (e.g., "2 berkas")

  @IsOptional()
  @IsArray()
  lampiran_temp_ids?: string[]; // Array of lampiran IDs yang sudah diupload temporary

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[]; // Array file paths untuk lampiran

  // ============================================
  // REFERENSI NASKAH (untuk sirkulasi persuratan)
  // ============================================
  /**
   * ID Naskah Referensi (opsional)
   * Diisi jika nota dinas ini merupakan tindak lanjut/balasan dari surat sebelumnya.
   * Jika diisi, akan otomatis insert ke tabel naskah_referensi.
   * Bisa referensi ke semua jenis naskah: ND, SDI, SDE, DI, KA
   */
  @IsOptional()
  @IsString()
  id_referensi_naskah?: string;

  // ============================================
  // PDF FINAL
  // ============================================
  @IsOptional()
  @IsString()
  final_pdf?: string; // URL/path file PDF final

  // ============================================
  // OPTIONS
  // ============================================
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
  tgl?: string; // Tanggal untuk lookup org_data (default: hari ini)

  // ============================================
  // DIGITAL SIGNATURE OPTIONS
  // ============================================
  @IsOptional()
  @IsEnum(SignOption, { message: 'sign_option tidak valid' })
  sign_option?: SignOption; // Opsi tanda tangan: digsig, qr_only, none

  @IsOptional()
  @IsString()
  passphrase?: string; // BSrE passphrase (required if sign_option = digsig)
}

/**
 * DTO untuk Finalize Draft (update status dari draf ke final/final_tte)
 * Clone dari UpdateDraftDto - bisa update semua field sebelum finalize
 * Status akan berubah dari draf ke final/final_tte dan isDraft jadi false
 */
export class FinalizeDraftDto {
  // ============================================
  // SIRKULASI
  // ============================================
  @IsOptional()
  pengirim?: number; // positionId pengirim

  @IsOptional()
  @IsArray()
  penerima?: number[]; // array positionId penerima

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array positionId tembusan

  // ============================================
  // KOP NASKAH (KEPALA)
  // ============================================
  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

  // ============================================
  // DATA NASKAH (KEPALA + BATANG TUBUH)
  // ============================================
  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsEnum(SifatSurat, { message: 'Sifat tidak valid' })
  sifat?: SifatSurat;

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsBoolean()
  english?: boolean;

  // ============================================
  // KAKI SURAT
  // ============================================
  @IsOptional()
  @IsString()
  nama_tempat?: string;

  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  tanda_tangan?: string; // Jika diisi -> final_tte, jika tidak -> final

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  // ============================================
  // LAMPIRAN
  // ============================================
  @IsOptional()
  @IsString()
  lampiran?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];

  // Lampiran temp IDs (dari POST /upload-temporary)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

  // ============================================
  // PDF FINAL
  // ============================================
  @IsOptional()
  @IsString()
  final_pdf?: string; // URL/path file PDF final

  // ============================================
  // OPTIONS
  // ============================================
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
  tgl?: string;

  // ============================================
  // DIGITAL SIGNATURE OPTIONS
  // ============================================
  @IsOptional()
  @IsEnum(SignOption, { message: 'sign_option must be one of: digsig, qr_only, none' })
  sign_option?: SignOption;

  @IsOptional()
  @IsString()
  passphrase?: string;
}

/**
 * DTO untuk Update Draft (update data draft, status tetap draf)
 * Semua field optional karena bisa partial update
 */
export class UpdateDraftDto {
  // ============================================
  // SIRKULASI
  // ============================================
  @IsOptional()
  pengirim?: number; // positionId pengirim

  @IsOptional()
  @IsArray()
  penerima?: number[]; // array positionId penerima

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array positionId tembusan

  // ============================================
  // KOP NASKAH (KEPALA)
  // ============================================
  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

  // ============================================
  // DATA NASKAH (KEPALA + BATANG TUBUH)
  // ============================================
  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsEnum(SifatSurat, { message: 'Sifat tidak valid' })
  sifat?: SifatSurat;

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsBoolean()
  english?: boolean;

  // ============================================
  // KAKI SURAT
  // ============================================
  @IsOptional()
  @IsString()
  nama_tempat?: string;

  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  tanda_tangan?: string;

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  // ============================================
  // LAMPIRAN
  // ============================================
  @IsOptional()
  @IsString()
  lampiran?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[]; // Array of lampiran IDs yang sudah diupload temporary

  // ============================================
  // PDF FINAL
  // ============================================
  @IsOptional()
  @IsString()
  final_pdf?: string; // URL/path file PDF final

  // ============================================
  // OPTIONS
  // ============================================
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
  tgl?: string;
}
