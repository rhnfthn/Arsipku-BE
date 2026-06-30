import { IsOptional, IsEnum, IsNumber, IsDateString, IsBoolean, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryLabelNaskahDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    return String(value).trim();
  })
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    return String(value).toLowerCase().trim();
  })
  @IsEnum(['inbox', 'sent', 'draft'], {
    message: 'Source tidak valid. Gunakan: inbox, sent, atau draft',
  })
  source?: 'inbox' | 'sent' | 'draft';

  @IsOptional()
  @IsEnum(['ND', 'SDI', 'SDE', 'DI', 'KA', 'K'], { message: 'Jenis naskah tidak valid' })
  jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K';

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
    return String(value).toLowerCase().trim().replace(/\s+/g, '_');
  })
  @IsEnum(['7_hari', '30_hari', '60_hari', '1_tahun', 'semua'], {
    message: 'Preset tidak valid. Gunakan: 7_hari, 30_hari, 60_hari, 1_tahun, atau semua',
  })
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
