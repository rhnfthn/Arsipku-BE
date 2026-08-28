import { IsString, IsOptional, IsDateString } from 'class-validator';

/**
 * DTO untuk menyimpan konsep SDE Masal (Form 1).
 */
export class CreateSdeMasalConceptDto {
  @IsOptional()
  @IsDateString()
  tanggalKonsep?: string;

  @IsOptional()
  @IsString()
  klasifikasiId?: string;

  @IsOptional()
  @IsString()
  klasifikasiName?: string;

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
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  defaultTertuju?: string;

  @IsOptional()
  @IsString()
  parentNaskahId?: string;
}
