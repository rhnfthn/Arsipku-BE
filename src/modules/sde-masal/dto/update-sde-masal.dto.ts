import { IsString, IsOptional, IsArray } from 'class-validator';

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
