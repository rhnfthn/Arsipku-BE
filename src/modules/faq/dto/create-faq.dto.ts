import { IsString, IsNotEmpty, IsEnum, MaxLength } from 'class-validator';
import { FaqKategori } from '../entities/faq.entity';

export class CreateFaqDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  pertanyaan: string;

  @IsString()
  @IsNotEmpty()
  deskripsi: string;

  @IsEnum(FaqKategori)
  @IsNotEmpty()
  kategori: FaqKategori;
}
