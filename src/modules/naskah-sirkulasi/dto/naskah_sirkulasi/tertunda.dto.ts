import { IsOptional, IsEnum, IsNumber, IsDateString, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Query params untuk filter surat tertunda (naskah pending TTD basah)
 */
export class TertundaQueryDto {
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

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  priority?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'Format start_date tidak valid (gunakan YYYY-MM-DD)' })
  start_date?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Format end_date tidak valid (gunakan YYYY-MM-DD)' })
  end_date?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '_');
    return normalized;
  })
  @IsEnum(['7_hari', '30_hari', '60_hari', '1_tahun', 'semua'], { message: 'Preset tidak valid. Gunakan: 7_hari, 30_hari, 60_hari, 1_tahun, atau semua' })
  preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua';

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    return String(value).toLowerCase().trim();
  })
  @IsEnum(['terbaru', 'terlama'], { message: 'Sort tidak valid. Gunakan: terbaru atau terlama' })
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
 * Item dalam daftar surat tertunda
 */
export class TertundaItemDto {
  id_naskah: string;
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  jenis_label: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  sifat: string;
  status: 'pending';
  lampiran: number;
  pengirim: {
    position_id: string;
    position_text: string;
    organization_text: string;
    nama: string | null;
  };
  penerima: {
    position_id: string;
    position_text: string;
    nama: string | null;
  }[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Response DTO untuk surat tertunda
 */
export class TertundaResponseDto {
  success: boolean;
  message: string;
  data: TertundaItemDto[];
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
    };
  };
}
