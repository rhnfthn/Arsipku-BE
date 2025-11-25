import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateSubAreaAlamatDto {
  @IsString()
  @IsOptional()
  start_date?: string;

  @IsString()
  @IsOptional()
  end_date?: string;

  @IsString()
  @MaxLength(50)
  company: string;

  @IsString()
  @MaxLength(50)
  area: string;

  @IsString()
  @MaxLength(50)
  sub_area: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  kantor?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  kantor_english?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  gedung?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  gedung_english?: string;

  @IsString()
  @IsOptional()
  alamat?: string;

  @IsString()
  @IsOptional()
  alamat_english?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  telepon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  logo?: string;
}
