import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateEksternalDto {
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
  alamat?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  telepon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  kontak?: string;

  @IsBoolean()
  @IsOptional()
  aktif?: boolean = true;
}
