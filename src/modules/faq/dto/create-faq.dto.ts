import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateFaqDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  pertanyaan: string;

  @IsString()
  @IsNotEmpty()
  deskripsi: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  kategori: string;
}
