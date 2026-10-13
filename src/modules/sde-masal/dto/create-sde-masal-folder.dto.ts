import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSdeMasalFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  judul: string;

  @IsOptional()
  @IsString()
  parentNaskahId?: string;

  @IsOptional()
  @IsDateString()
  tanggal?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasiText?: string;

  @IsOptional()
  @IsString()
  pengirimId?: string;

  @IsOptional()
  @IsString()
  pengirimName?: string;

  @IsOptional()
  @IsString()
  sifat?: string;

  @IsOptional()
  @IsIn(['EXTERNAL', 'INTERNAL'])
  recipientType?: 'EXTERNAL' | 'INTERNAL';

  @IsOptional()
  @IsString()
  atasNama?: string;

  @IsOptional()
  @IsString()
  atasNamaPositionId?: string;

  @IsOptional()
  @IsString()
  kontenTemplate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dynamicVariables?: string[];

  @IsOptional()
  @IsString()
  originalFileUrl?: string;

  @IsOptional()
  @IsIn(['digsig', 'qr_only', 'ttd_basah'])
  signOption?: 'digsig' | 'qr_only' | 'ttd_basah';

  @IsOptional()
  @IsString()
  createdBy?: string;
}
