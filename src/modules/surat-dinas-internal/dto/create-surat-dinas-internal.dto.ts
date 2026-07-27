import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Enum untuk sifat surat
export enum SifatSurat {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

// Enum untuk opsi tanda tangan
export enum SignOption {
  DIGSIG = 'digsig', // TTD Digital dengan BSrE (passphrase required)
  QR_ONLY = 'qr_only', // Tanpa TTD Digital, hanya QR code
  TTD_BASAH = 'ttd_basah', // TTD Basah (tanpa QR, space untuk tanda tangan manual)
}

// Main DTO untuk send-message SDI
export class CreateSuratDinasInternalDto {
  @IsNotEmpty({ message: 'Pengirim harus diisi' })
  pengirim: number; // positionId

  @IsArray({ message: 'Penerima harus berupa array' })
  @IsOptional()
  penerima?: number[]; // array of positionId (individual)

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array of positionId (individual)

  // ============================================
  // GRUP PENERIMA (Alternative to individual)
  // ============================================
  /**
   * ID Grup Penerima (UUID dari tabel grup_penerima)
   * Jika diisi, akan expand semua anggota grup sebagai penerima.
   * Bisa digunakan bersamaan dengan field penerima (akan digabung).
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  penerima_grup?: string[];

  /**
   * ID Grup Tembusan (UUID dari tabel grup_penerima)
   * Jika diisi, akan expand semua anggota grup sebagai tembusan.
   * Bisa digunakan bersamaan dengan field tembusan (akan digabung).
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  tembusan_grup?: string[];

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

  // Lampiran temp IDs (RECOMMENDED - dari POST /upload-temporary)
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
  // DIGITAL SIGNATURE OPTIONS (NEW)
  // ============================================

  /**
   * Opsi tanda tangan digital:
   * - 'digsig': TTD Digital dengan BSrE (passphrase required)
   * - 'qr_only': Tanpa TTD Digital, hanya QR code (untuk verifikasi visual)
   * - 'ttd_basah': TTD Basah (tanpa QR, space untuk tanda tangan manual)
   */
  @IsOptional()
  @IsEnum(SignOption, {
    message: 'sign_option harus salah satu dari: digsig, qr_only, ttd_basah',
  })
  sign_option?: SignOption;

  /**
   * Passphrase untuk BSrE digital signature
   * Wajib diisi jika sign_option = 'digsig'
   */
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
 * DTO untuk Finalize Draft (update status dari draf ke final/final_tte)
 * Clone dari UpdateDraftDto - bisa update semua field sebelum finalize
 * Status akan berubah dari draf ke final/final_tte dan isDraft jadi false
 */
export class FinalizeDraftDto {
  // Actor delegasi context — di-set controller dari @CurrentUser (Spec B-2b).
  @IsOptional()
  @IsString()
  actor_position_status?: string | null;

  @IsOptional()
  @IsString()
  actor_nama?: string;

  // ============================================
  // SIRKULASI
  // ============================================
  @IsOptional()
  pengirim?: number; // positionId pengirim

  @IsOptional()
  @IsArray()
  penerima?: number[]; // array positionId penerima (individual)

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array positionId tembusan (individual)

  // ============================================
  // GRUP PENERIMA
  // ============================================
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  penerima_grup?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  tembusan_grup?: string[];

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

  // Lampiran temp IDs (RECOMMENDED - dari POST /upload-temporary)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

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
    message: 'sign_option must be one of: digsig, qr_only, ttd_basah',
  })
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
  // Actor delegasi context — di-set controller dari @CurrentUser (Spec B-2b).
  @IsOptional()
  @IsString()
  actor_position_status?: string | null;

  @IsOptional()
  @IsString()
  actor_nama?: string;

  // ============================================
  // SIRKULASI
  // ============================================
  @IsOptional()
  pengirim?: number; // positionId pengirim

  @IsOptional()
  @IsArray()
  penerima?: number[]; // array positionId penerima (individual)

  @IsOptional()
  @IsArray()
  tembusan?: number[]; // array positionId tembusan (individual)

  // ============================================
  // GRUP PENERIMA
  // ============================================
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  penerima_grup?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  tembusan_grup?: string[];

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

  // Lampiran temp IDs (RECOMMENDED - dari POST /upload-temporary)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

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
}
