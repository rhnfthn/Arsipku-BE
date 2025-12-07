import { IsNotEmpty, IsArray, IsOptional, IsString, IsBoolean, IsEnum, ArrayMinSize, Matches } from 'class-validator';

// Enum untuk sifat surat
export enum SifatSurat {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

// Main DTO untuk send-message SDI
export class CreateSuratDinasInternalDto {
  @IsNotEmpty({ message: 'Pengirim harus diisi' })
  pengirim: number; // positionId

  @IsArray({ message: 'Penerima harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  penerima: number[]; // array of positionId

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array of positionId

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
  tgl?: string; // Optional date in format YYYY-MM-DD (for org_data lookup)

  // Kop naskah (optional)
  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

  // Naskah data
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
  @IsString()
  nama_tempat?: string;

  @IsOptional()
  @IsBoolean()
  english?: boolean;

  // Tanda tangan section (for sdi_sde table)
  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  tanda_tangan?: string;

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  // Lampiran
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];
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

  // ============================================
  // OPTIONS
  // ============================================
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
  tgl?: string;
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

  // ============================================
  // OPTIONS
  // ============================================
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
  tgl?: string;
}
