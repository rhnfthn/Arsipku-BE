// ============================================================
// DTO: UpdatePedomanDto
// Validasi input saat MENGUPDATE pedoman.
// Semua field opsional — hanya field yang dikirim yang diupdate.
// ============================================================

import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  MaxLength,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { PedomanJenis } from '../entities/pedoman.entity';

export class UpdatePedomanDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  judul?: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;

  @IsEnum(PedomanJenis)
  @IsOptional()
  jenis?: PedomanJenis;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  nomorDokumen?: string;

  @IsDateString()
  @IsOptional()
  tanggalBerlaku?: string;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.fileUrl && o.fileUrl.trim().length > 0)
  @IsUrl()
  @MaxLength(255)
  fileUrl?: string;

  @IsOptional()
  lampirans?: { url: string; name: string }[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}