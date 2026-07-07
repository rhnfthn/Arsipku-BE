import {
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Query params untuk filter sent messages (kotak keluar)
 */
export class SentMessageQueryDto {
  @IsOptional()
  @IsEnum(['ND', 'SDI', 'SDE', 'DI', 'KA', 'K'], {
    message: 'Jenis naskah tidak valid',
  })
  jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K';

  @IsOptional()
  @IsEnum(['terbaca', 'belum_terbaca'], { message: 'Status baca tidak valid' })
  status_baca?: 'terbaca' | 'belum_terbaca';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @IsEnum(['sudah_tinjut', 'belum_tinjut'], {
    message: 'Status tindak lanjut tidak valid',
  })
  tinjut?: 'sudah_tinjut' | 'belum_tinjut';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lock?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  note?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  arsip?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  priority?: boolean;

  // Date Range Filter
  @IsOptional()
  @IsDateString(
    {},
    { message: 'Format start_date tidak valid (gunakan YYYY-MM-DD)' },
  )
  start_date?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsDateString(
    {},
    { message: 'Format end_date tidak valid (gunakan YYYY-MM-DD)' },
  )
  end_date?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    // Normalize preset value: "7 hari" -> "7_hari", "7hari" -> "7_hari", etc.
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '_');
    return normalized;
  })
  @IsEnum(['7_hari', '30_hari', '60_hari', '1_tahun', 'semua'], {
    message:
      'Preset tidak valid. Gunakan: 7_hari, 30_hari, 60_hari, 1_tahun, atau semua',
  })
  preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua';

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    return String(value).toLowerCase().trim();
  })
  @IsEnum(['terbaru', 'terlama'], {
    message: 'Sort tidak valid. Gunakan: terbaru atau terlama',
  })
  sort?: 'terbaru' | 'terlama';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}

/**
 * Info sirkulasi singkat
 */
export class SirkulasiInfoDto {
  position_id: string;
  position_text: string;
  organization_text: string;
  nama: string | null;
}

/**
 * Info penerima dengan status baca
 */
export class PenerimaWithStatusDto {
  position_id: string;
  position_text: string;
  organization_text: string;
  nama: string | null;
  status_baca: 'terbaca' | 'belum_terbaca';
  read_time: Date | null;
  is_tindak_lanjut?: boolean;
}

export class SentTrackingLogDto {
  id_sirkulasi: string;
  id_naskah: string;
  jenis: string;
  jenis_label: string;
  nomor: string | null;
  perihal: string | null;
  created_at: Date;
  pengirim: SirkulasiInfoDto;
  penerima: PenerimaWithStatusDto[];
  tembusan: PenerimaWithStatusDto[];
  summary_baca: {
    total: number;
    terbaca: number;
    belum_terbaca: number;
  };
  summary_tindak_lanjut: {
    total: number;
    sudah: number;
    belum: number;
  };
}

/**
 * Item dalam daftar sent messages
 */
export class SentMessageItemDto {
  id_sirkulasi: string;
  id_naskah: string;
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K';
  jenis_label: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  sifat: string;
  status: string;
  lampiran: number;
  pengirim: SirkulasiInfoDto;
  penerima: PenerimaWithStatusDto[];
  tembusan: PenerimaWithStatusDto[];
  tracking_logs?: SentTrackingLogDto[];
  summary_baca: {
    total: number;
    terbaca: number;
    belum_terbaca: number;
  };
  favorit: boolean;
  note: boolean;
  arsip: boolean;
  is_tindak_lanjut?: boolean;
  is_locked?: boolean;
  is_priority?: boolean;
  labels: string[]; // Array nama label yang di-assign ke naskah

  // Source identifier (inbox/sent)
  source?: 'inbox' | 'sent';
  created_at: Date;
  updated_at: Date;
}

/**
 * Response DTO untuk sent messages (kotak keluar)
 */
export class SentMessageResponseDto {
  success: boolean;
  message: string;
  data: SentMessageItemDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    total_semua: number;
    total_per_jenis: {
      ND: number;
      SDI: number;
      SDE: number;
      DI: number;
      KA: number;
      K: number;
    };
  };
}
