import { IsString, IsNumber, IsOptional, MaxLength } from 'class-validator';

export class CreateKlasifikasiDto {
  @IsString()
  @MaxLength(255)
  company: string;

  @IsString()
  @MaxLength(255)
  klasifikasi: string;

  @IsString()
  @IsOptional()
  klasifikasi_text?: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;

  @IsString()
  @IsOptional()
  @MaxLength(36)
  id_parent?: string;

  @IsNumber()
  @IsOptional()
  active?: number = 1;
}
