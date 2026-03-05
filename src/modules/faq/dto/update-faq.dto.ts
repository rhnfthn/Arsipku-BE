import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { FaqKategori } from '../entities/faq.entity';

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pertanyaan?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsEnum(FaqKategori)
  kategori?: FaqKategori;
}
