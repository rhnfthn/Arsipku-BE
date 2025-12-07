import { IsString, IsOptional, MaxLength, IsDateString } from 'class-validator';

export class CreateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nama_template?: string;

  // Untuk upload via JSON (base64 encoded)
  @IsOptional()
  @IsString()
  file_base64?: string; // Base64 encoded file content

  @IsOptional()
  @IsString()
  @MaxLength(255)
  file_name?: string; // Original filename

  @IsOptional()
  @IsString()
  @MaxLength(100)
  file_mimetype?: string; // MIME type (e.g., application/pdf)

  @IsOptional()
  @IsDateString()
  tanggal?: string;
}
