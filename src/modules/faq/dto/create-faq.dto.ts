import { IsString, IsNotEmpty, IsUUID, MaxLength, IsOptional, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

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

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.fileUrl && o.fileUrl.trim().length > 0)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MaxLength(255)
  fileUrl?: string;

  @IsOptional()
  lampirans?: { url: string; name: string }[];
}
