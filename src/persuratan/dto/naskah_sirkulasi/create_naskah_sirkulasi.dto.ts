import {
  IsString,
  IsOptional,
  MaxLength,
  IsInt,
  IsEnum,
  IsDateString,
  IsNumber,
} from 'class-validator';

export class CreateNaskahSirkulasiDto {
  @IsString()
  @IsOptional()
  @MaxLength(36)
  id?: string;

  @IsString()
  @IsOptional()
  @MaxLength(36)
  idNaskah?: string;

  @IsEnum(['pengirim', 'penerima', 'tembusan'])
  @IsOptional()
  sirkuler?: 'pengirim' | 'penerima' | 'tembusan';

  @IsEnum(['pyb', 'pt', 'ph', 'ext'])
  @IsOptional()
  positionStatus?: 'pyb' | 'pt' | 'ph' | 'ext';

  @IsString()
  @IsOptional()
  @MaxLength(36)
  idSirkuler?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  alamat?: string;

  @IsString()
  @IsOptional()
  @MaxLength(36)
  idGrupPenerima?: string;

  @IsDateString()
  @IsOptional()
  sendReadTime?: string;

  @IsString()
  @IsOptional()
  @MaxLength(36)
  idLabel?: string;

  @IsNumber()
  @IsOptional()
  flagFavorit?: number;

  @IsNumber()
  @IsOptional()
  flagNote?: number;

  @IsNumber()
  @IsOptional()
  flagArsip?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  areaText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  subAreaText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  organizationText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  positionText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  namaSirkuler?: string;

  @IsDateString()
  @IsOptional()
  createAt?: string;

  @IsDateString()
  @IsOptional()
  updateAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  uname?: string;

  @IsInt()
  @IsOptional()
  company?: number;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  area?: string;

  @IsString()
  @IsOptional()
  @MaxLength(11)
  subArea?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  organization?: string;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  position?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  telepon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  sendReadUser?: string;
}
