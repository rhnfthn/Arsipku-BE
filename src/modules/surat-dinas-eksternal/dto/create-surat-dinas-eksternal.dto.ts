import { IsNotEmpty, IsArray, IsOptional, IsString, IsBoolean, IsEnum, ArrayMinSize, Matches } from 'class-validator';

// Enum untuk sifat surat
export enum SifatSurat {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
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
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  @IsString({ each: true })
  penerima: string[]; // array of eksternal.id (UUID)

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
  tgl?: string; // Optional date in format YYYY-MM-DD (for org_data lookup)

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
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'tgl must be in format YYYY-MM-DD' })
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
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];
}

/**
 * DTO untuk send-draft (finalize) SDE
 * Same as UpdateSdeDraftDto
 */
export class FinalizeSdeDraftDto extends UpdateSdeDraftDto {}
