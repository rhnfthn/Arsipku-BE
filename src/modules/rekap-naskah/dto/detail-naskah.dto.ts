import { IsOptional, IsNumberString, IsString } from 'class-validator';

/**
 * DTO untuk query parameter detail naskah
 */
export class DetailNaskahQueryDto {
  @IsOptional()
  @IsNumberString()
  tahun?: string;

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
  position?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Interface untuk data detail naskah
 */
export interface DetailNaskahData {
  id: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  jenis: string | null;
  jenis_text: string | null;
  klasifikasi: string | null;
  jabatan: string | null;
  lokasi: string | null;
  status: string;
  file_name: string | null;
  file_url: string | null;
  created_at: Date;
}

/**
 * Response DTO untuk detail naskah
 */
export class DetailNaskahResponseDto {
  success: boolean;
  message: string;
  data: DetailNaskahData[];
}
