import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pertanyaan?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsUUID()
  kategoriId?: string;
}
