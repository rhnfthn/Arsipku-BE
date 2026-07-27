import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

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

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.fileUrl && o.fileUrl.trim().length > 0)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(255)
  fileUrl?: string;

  @IsOptional()
  lampirans?: { url: string; name: string }[];
}
