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

  @IsOptional()
  @IsString()
  idTertuju?: string;

  @IsOptional()
  @IsString()
  idramount?: string;

  @IsOptional()
  @IsString()
  usdamount?: string;

  @IsOptional()
  @IsString()
  namacro?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  tembusan?: string;

  @IsOptional()
  @IsString()
  emailTertuju?: string;

  @IsOptional()
  @IsString()
  emailCc?: string;

  @IsOptional()
  @IsString()
  emailBcc?: string;

  @IsOptional()
  @IsString()
  jumlahTagihanIdr?: string;

  @IsOptional()
  @IsString()
  jumlahTagihanUsd?: string;

  @IsOptional()
  @IsString()
  namaCro?: string;

  @IsOptional()
  @IsString()
  emailCro?: string;

  @IsOptional()
  @IsString()
  jabatanSigner?: string;

  @IsOptional()
  @IsString()
  namaSigner?: string;
}