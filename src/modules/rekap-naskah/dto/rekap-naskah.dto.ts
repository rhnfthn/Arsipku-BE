import { IsOptional, IsNumberString, IsString } from 'class-validator';

/**
 * DTO untuk query parameter rekap naskah dinas
 */
export class RekapNaskahQueryDto {
  @IsOptional()
  @IsNumberString()
  tahun?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  position?: string;
}

/**
 * Interface untuk data rekap per jenis per status
 */
export interface RekapJenisData {
  jenis: string;
  jenis_text: string | null;
  status: string;
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
 * Response DTO untuk rekap naskah dinas
 */
export class RekapNaskahResponseDto {
  success: boolean;
  message: string;
  data: {
    tahun: number | null;
    area?: string;
    position?: string;
    rekap: RekapJenisData[];
  };
}
