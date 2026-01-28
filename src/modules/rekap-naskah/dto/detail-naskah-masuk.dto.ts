import { IsOptional, IsNumberString, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO untuk query parameter detail naskah masuk
 */
export class DetailNaskahMasukQueryDto {
  @IsOptional()
  @IsNumberString()
  tahun?: string;

  @IsOptional()
  @IsNumberString()
  bulan?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  jenis?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  limit?: number;
}

/**
 * Interface untuk data detail naskah masuk
 */
export interface DetailNaskahMasukData {
  id: string;
  naskah: string | null;
  naskah_text: string | null;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  jabatan: string | null;
  lokasi: string | null;
  status: string;
}

/**
 * Response DTO untuk detail naskah masuk dengan pagination
 */
export class DetailNaskahMasukResponseDto {
  success: boolean;
  message: string;
  data: DetailNaskahMasukData[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
