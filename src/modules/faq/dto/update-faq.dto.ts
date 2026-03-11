import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pertanyaan?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kategori?: string;
}
