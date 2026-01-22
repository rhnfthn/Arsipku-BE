import { IsOptional, IsNumberString, IsString } from 'class-validator';

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
}
