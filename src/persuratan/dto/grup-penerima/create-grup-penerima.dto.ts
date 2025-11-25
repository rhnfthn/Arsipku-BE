import { IsString, IsInt, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateGrupPenerimaDto {
  @IsString()
  @MaxLength(50)
  company: string;

  @IsString()
  @MaxLength(50)
  area: string;

  @IsString()
  @MaxLength(150)
  nama: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;

  @IsString()
  @IsOptional()
  deskripsi_english?: string;

  @IsInt()
  @IsOptional()
  urutan?: number;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}
