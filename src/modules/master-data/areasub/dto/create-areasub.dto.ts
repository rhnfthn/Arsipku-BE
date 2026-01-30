import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class CreateAreasubDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(11)
  area: string;

  @IsNumber()
  sub_area: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsString()
  @MaxLength(50)
  shortText: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  longText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  uname?: string;

  // Alamat lengkap untuk auto-insert ke sub_area_alamat
  @IsOptional()
  @IsString()
  kantor?: string;

  @IsOptional()
  @IsString()
  kantor_english?: string;

  @IsOptional()
  @IsString()
  gedung?: string;

  @IsOptional()
  @IsString()
  gedung_english?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  alamat_english?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telepon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  logo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kota?: string;
}
