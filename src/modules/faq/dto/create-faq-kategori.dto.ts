import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateFaqKategoriDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;
}
