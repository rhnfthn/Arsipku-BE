import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';

export class CreateFaqDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  pertanyaan: string;

  @IsString()
  @IsNotEmpty()
  deskripsi: string;

  @IsUUID()
  @IsNotEmpty()
  kategoriId: string;
}
