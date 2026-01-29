import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, IsBoolean, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Query params untuk filter inbox
 */
export class InboxQueryDto {
  @IsOptional()
  @IsEnum(['ND', 'SDI', 'SDE', 'DI', 'KA'], { message: 'Jenis naskah tidak valid' })
  jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';

  @IsOptional()
  @IsEnum(['terbaca', 'belum_terbaca'], { message: 'Status baca tidak valid' })
  status_baca?: 'terbaca' | 'belum_terbaca';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @IsEnum(['sudah_tinjut', 'belum_tinjut'], { message: 'Status tindak lanjut tidak valid' })
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

  // Date Range Filter
  @IsOptional()
  @IsDateString({}, { message: 'Format start_date tidak valid (gunakan YYYY-MM-DD)' })
  start_date?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsDateString({}, { message: 'Format end_date tidak valid (gunakan YYYY-MM-DD)' })
  end_date?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    // Normalize preset value: "7 hari" -> "7_hari", "7hari" -> "7_hari", etc.
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '_');
    return normalized;
  })
  @IsEnum(['7_hari', '30_hari', '60_hari', '1_tahun', 'semua'], { message: 'Preset tidak valid. Gunakan: 7_hari, 30_hari, 60_hari, 1_tahun, atau semua' })
  preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua';

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
 * Item dalam daftar inbox
 */
export class InboxItemDto {
  id_sirkulasi: string;
  id_naskah: string;

  // Info Naskah (dari tabel naskah)
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  jenis_label: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  sifat: string;
  status: string;
  lampiran: string | null;

  // Info Pengirim
  pengirim: {
    position_id: string;
    position_text: string;
    organization_text: string;
    nama: string;
  };

  // Info Penerima (data user yang menerima - current user)
  penerima: {
    position_id: string;
    persnum: number;
    nama: string;
    position_text: string;
    organization_text: string;
  };

  // Kepada - Semua penerima yang dituju oleh pengirim (termasuk current user)
  kepada: Array<{
    position_id: string;
    nama: string;
    position_text: string;
    organization_text: string;
  }>;

  // Status Baca
  status_baca: 'terbaca' | 'belum_terbaca';
  read_time: Date | null;

  // Flags
  is_favorit: boolean;
  is_arsip: boolean;
  is_note: boolean;
  is_tindak_lanjut: boolean;
  is_locked: boolean;

  // Labels - array nama label yang di-assign ke naskah
  labels: string[];

  // Priority flag (hanya untuk jenis='DI')
  is_priority?: boolean;

  // Source identifier (inbox/sent)
  source?: 'inbox' | 'sent';

  // Timestamps
  created_at: Date;
  updated_at: Date;
}

/**
 * Response DTO untuk inbox
 */
export class InboxResponseDto {
  success: boolean;
  message: string;
  data: InboxItemDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    total_semua: number;
    total_belum_dibaca: number;
    total_per_jenis: {
      ND: number;
      SDI: number;
      SDE: number;
      DI: number;
      KA: number;
    };
  };
}
