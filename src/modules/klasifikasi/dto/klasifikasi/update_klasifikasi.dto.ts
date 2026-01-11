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
}
