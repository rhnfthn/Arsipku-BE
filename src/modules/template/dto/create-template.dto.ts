import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateTemplateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  id_position: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  nama_template: string;

  @IsOptional()
  @IsString()
  content?: string; // HTML content
}
