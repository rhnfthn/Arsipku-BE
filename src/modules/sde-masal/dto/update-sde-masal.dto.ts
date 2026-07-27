import { IsString, IsOptional } from 'class-validator';

/**
 * DTO untuk update item SDE Masal.
 */
export class UpdateSdeMasalDto {
  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  tertuju?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  kota?: string;

  @IsOptional()
  @IsString()
  kodePos?: string;

  @IsOptional()
  @IsString()
  jabatanPenerima?: string;

  @IsOptional()
  @IsString()
  isiRingkasan?: string;

  @IsOptional()
  @IsString()
  jenisTemplate?: string;

  @IsOptional()
  @IsString()
  statusVerifikasi?: string;
}