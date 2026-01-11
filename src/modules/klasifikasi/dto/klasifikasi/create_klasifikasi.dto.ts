import { IsString, IsNumber, IsOptional, MaxLength } from 'class-validator';

export class CreateKlasifikasiDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  company: string;

  @IsString()
  @MaxLength(50)
  klasifikasi: string;

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
