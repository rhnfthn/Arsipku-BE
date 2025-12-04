import { IsString, IsOptional, MaxLength, IsBoolean, IsDateString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MaxLength(150)
  nama_template: string;

  @IsString()
  @MaxLength(255)
  file: string;

  @IsOptional()
  @IsDateString()
  tanggal?: string;
}
