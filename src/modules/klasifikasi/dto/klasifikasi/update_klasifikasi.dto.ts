import { IsString, IsNumber, IsOptional, MaxLength } from 'class-validator';

export class UpdateKlasifikasiDto {
  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  klasifikasi_text?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsString()
  id_parent?: string;

  @IsOptional()
  @IsNumber()
  active?: number;

  @IsOptional()
  @IsNumber()
  is_select?: number;

  @IsOptional()
  @IsNumber()
  retensi_aktif_tahun?: number;

  @IsOptional()
  @IsNumber()
  retensi_inaktif_tahun?: number;

  @IsOptional()
  @IsString()
  penyusutan?: string;

  @IsOptional()
  @IsString()
  keamanan?: string;

  @IsOptional()
  @IsString()
  hak_akses?: string;
}
