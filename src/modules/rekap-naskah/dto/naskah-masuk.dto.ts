import {
  IsOptional,
  IsNumberString,
  IsString,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO untuk query parameter naskah masuk
 */
export class NaskahMasukQueryDto {
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
  klasifikasi?: string;

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
 * Interface untuk data rekap naskah masuk per jenis per bulan
 */
export interface NaskahMasukJenisData {
  jenis: string;
  jenis_text: string | null;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  mei: number;
  jun: number;
  jul: number;
  agu: number;
  sep: number;
  okt: number;
  nov: number;
  des: number;
  total: number;
}

/**
 * Response DTO untuk naskah masuk
 */
export class NaskahMasukResponseDto {
  success: boolean;
  message: string;
  data: {
    tahun: number;
    bulan?: number | null;
    area?: string;
    jenis?: string;
    klasifikasi?: string;
    rekap: NaskahMasukJenisData[];
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
