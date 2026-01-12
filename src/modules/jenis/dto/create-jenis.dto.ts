import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateJenisDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(20)
  jenis: string;

  @IsString()
  @MaxLength(255)
  jenis_text: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  file_text?: string;

  @IsOptional()
  @IsString()
  format_penomoran?: string;

  // File upload fields (handled by multer, not validated here)
  // file: Express.Multer.File - uploaded file akan di-handle di controller
}
