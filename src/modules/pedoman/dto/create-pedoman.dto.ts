// ============================================================
// DTO: CreatePedomanDto
// Validasi input saat MEMBUAT pedoman baru.
// Semua field wajib kecuali fileUrl, lampirans, isActive.
// ============================================================

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  MaxLength,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { PedomanJenis } from '../entities/pedoman.entity';

export class CreatePedomanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  judul: string;

  @IsString()
  @IsNotEmpty()
  deskripsi: string;

  @IsEnum(PedomanJenis)
  @IsNotEmpty()
  jenis: PedomanJenis;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nomorDokumen: string;

  @IsDateString()
  @IsNotEmpty()
  tanggalBerlaku: string;

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