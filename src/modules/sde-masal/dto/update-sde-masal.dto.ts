import { IsString, IsOptional, IsArray } from 'class-validator';

/**
 * DTO untuk update item SDE Masal (versi ramping).
 * Hanya field yang masih ada di tabel sde_masal.
 */
export class UpdateSdeMasalDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  recipientData?: string;

  @IsOptional()
  @IsString()
  naskahId?: string;

  @IsOptional()
  @IsString()
  statusVerifikasi?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsArray()
  verifikators?: any[];

  @IsOptional()
  @IsString()
  currentVerifikatorUrutan?: number;

  @IsOptional()
  @IsString()
  submittedAt?: Date;
}
