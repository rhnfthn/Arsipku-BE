import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  ArrayMinSize,
  Matches,
  IsNumber,
} from 'class-validator';

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
  DIGSIG = 'digsig', // TTD Digital dengan BSrE + QR
  QR_ONLY = 'qr_only', // Hanya QR tanpa BSrE
  TTD_BASAH = 'ttd_basah', // TTD Basah (tanpa QR, space untuk tanda tangan manual)
}

/**
 * DTO untuk send-message SDE (Surat Dinas Eksternal)
 *
 * Perbedaan dengan SDI:
 * - penerima: array of eksternal.id (string UUID), bukan positionId
 * - Tidak ada tembusan internal (karena tujuan ke luar)
 */
export class CreateSuratDinasEksternalDto {
  // ============================================
  // SIRKULASI
  // ============================================
  @IsNotEmpty({ message: 'Pengirim harus diisi' })
  pengirim: number; // positionId dari org_data

  @IsArray({ message: 'Penerima harus berupa array' })
  @IsOptional()
  @IsString({ each: true })
  penerima?: string[]; // array of eksternal.id (UUID) - optional

  /** Nama tujuan internal khusus untuk PDF SDE Massal; tidak membuat penerima eksternal. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  penerima_display?: string[];

  @IsOptional()
  penerima_eksternal?: any; // array of {nama_eksternal, posisi_eksternal, alamat_eksternal} or JSON string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string; // Optional date in format YYYY-MM-DD (for org_data lookup)

  // ============================================
  // REFERENSI NASKAH (untuk sirkulasi persuratan)
  // ============================================
  /**
   * ID Naskah Referensi (opsional)
   * Diisi jika surat ini merupakan tindak lanjut/balasan dari surat sebelumnya.
   * Jika diisi, akan otomatis insert ke tabel naskah_referensi dengan data dari surat yang direferensikan.
   * Bisa referensi ke semua jenis naskah: ND, SDI, SDE, DI, KA, K
   */
  @IsOptional()
  @IsString()
  id_referensi_naskah?: string;

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
  @IsNotEmpty({ message: 'Klasifikasi harus diisi' })
  @IsString()
  klasifikasi: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsNotEmpty({ message: 'Sifat surat harus diisi' })
  @IsEnum(SifatSurat, { message: 'Sifat tidak valid' })
  sifat: SifatSurat;

  @IsOptional()
  @IsString()
  lampiran?: string;

  @IsNotEmpty({ message: 'Perihal harus diisi' })
  @IsString()
  perihal: string;

  @IsNotEmpty({ message: 'Konten harus diisi' })
  @IsString()
  konten: string;

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
  // GARIS KEWENANGAN (a.n.) — Optional
  // ============================================
  // atas_nama: label pemberi kuasa, e.g. "Direktur Utama" atau "Direksi".
  // atas_nama_position_id: position id pemberi kuasa untuk auto-tembusan (null untuk Dirut → "Direksi").
  @IsOptional()
  @IsString()
  atas_nama?: string | null;

  @IsOptional()
  @IsNumber()
  atas_nama_position_id?: number | null;

  // ============================================
  // TEMBUSAN (Optional for SDE)
  // ============================================
  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array of positionId untuk tembusan

  /** Label tembusan tambahan khusus render PDF SDE Massal (tidak membuat sirkulasi internal). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tembusan_pdf_tambahan?: string[];

  // ============================================
  // LAMPIRAN
  // ============================================
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];

  // Lampiran temp IDs (RECOMMENDED - dari POST /upload-temporary)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

  /** Referensi PDF content-addressed dari SDE Masal (internal/additive). */
  lampiran_direct_refs?: Array<{ fileName: string; key: string }>;

  // ============================================
  // SIGNING OPTIONS
  // ============================================
  @IsOptional()
  @IsEnum(SignOption, {
    message: 'sign_option tidak valid (harus digsig, qr_only, atau ttd_basah)',
  })
  sign_option?: SignOption;

  @IsOptional()
  @IsString()
  passphrase?: string;
}

/**
 * DTO untuk update-draft SDE
 * Semua field optional untuk partial update
 */
export class UpdateSdeDraftDto {
  @IsOptional()
  pengirim?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  penerima?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;

  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

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
  lampiran?: string;

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsBoolean()
  english?: boolean;

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

  @IsOptional()
  @IsString()
  atas_nama?: string | null;

  @IsOptional()
  @IsNumber()
  atas_nama_position_id?: number | null;

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array of positionId untuk tembusan

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];

  // Lampiran temp IDs (dari POST /upload-temporary)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

}

/**
 * DTO untuk send-draft (finalize) SDE
 * Extended with digital signature options
 */
export class FinalizeSdeDraftDto extends UpdateSdeDraftDto {
  // ============================================
  // DIGITAL SIGNATURE OPTIONS
  // ============================================
  @IsOptional()
  @IsEnum(SignOption, {
    message: 'sign_option must be one of: digsig, qr_only, ttd_basah',
  })
  sign_option?: SignOption;

  @IsOptional()
  @IsString()
  passphrase?: string;
}
