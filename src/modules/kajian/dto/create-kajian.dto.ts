import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  ArrayMinSize,
  Matches,
} from 'class-validator';

// Enum untuk sifat naskah
export enum SifatSurat {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

// Enum untuk opsi tanda tangan
export enum SignOption {
  DIGSIG = 'digsig', // BSrE + QR Code
  QR_ONLY = 'qr_only', // QR Code only (tanpa BSrE)
  TTD_BASAH = 'ttd_basah', // TTD Basah (tanpa QR, space untuk tanda tangan manual)
}

/**
 * DTO untuk Send Message Kajian (KA)
 * Format flat - semua field dalam satu level (sama dengan Nota Dinas)
 */
export class CreateKajianDto {
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
  // LAMPIRAN
  // ============================================
  @IsOptional()
  @IsString()
  lampiran?: string;

  @IsOptional()
  @IsArray()
  lampiran_temp_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];

  // ============================================
  // PDF FINAL
  // ============================================
  @IsOptional()
  @IsString()
  final_pdf?: string;

  // ============================================
  // OPTIONS
  // ============================================
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;

  // ============================================
  // DIGITAL SIGNATURE OPTIONS
  // ============================================
  @IsOptional()
  @IsEnum(SignOption, {
    message: 'sign_option harus salah satu: digsig, qr_only, atau ttd_basah',
  })
  sign_option?: SignOption;

  @IsOptional()
  @IsString()
  passphrase?: string;

  // Actor delegasi context — di-set oleh controller dari @CurrentUser (Spec B-2b).
  // Dipakai service untuk render pengirim sirkulasi (prefix actor + nama delegate).
  @IsOptional()
  @IsString()
  actor_position_status?: string | null;

  @IsOptional()
  @IsString()
  actor_nama?: string;
}

/**
 * DTO untuk Finalize Draft Kajian
 */
export class FinalizeDraftDto {
  // Actor delegasi context — di-set controller dari @CurrentUser (Spec B-2b).
  @IsOptional()
  @IsString()
  actor_position_status?: string | null;

  @IsOptional()
  @IsString()
  actor_nama?: string;

  @IsOptional()
  pengirim?: number;

  @IsOptional()
  @IsArray()
  penerima?: number[];

  @IsOptional()
  @IsArray()
  tembusan?: number[];

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
  lampiran?: string;

  @IsOptional()
  @IsArray()
  lampiran_temp_ids?: string[];

  @IsOptional()
  @IsString()
  final_pdf?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;

  // ============================================
  // DIGITAL SIGNATURE OPTIONS
  // ============================================
  @IsOptional()
  @IsEnum(SignOption, {
    message: 'sign_option harus salah satu: digsig, qr_only, atau ttd_basah',
  })
  sign_option?: SignOption;

  @IsOptional()
  @IsString()
  passphrase?: string;
}

/**
 * DTO untuk Update Draft Kajian
 */
export class UpdateDraftDto {
  // Actor delegasi context — di-set controller dari @CurrentUser (Spec B-2b).
  @IsOptional()
  @IsString()
  actor_position_status?: string | null;

  @IsOptional()
  @IsString()
  actor_nama?: string;

  @IsOptional()
  pengirim?: number;

  @IsOptional()
  @IsArray()
  penerima?: number[];

  @IsOptional()
  @IsArray()
  tembusan?: number[];

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
  lampiran?: string;

  @IsOptional()
  @IsArray()
  lampiran_temp_ids?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;
}
