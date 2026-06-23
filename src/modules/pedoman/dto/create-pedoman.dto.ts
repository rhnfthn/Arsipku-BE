import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  MaxLength,
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
  @MaxLength(255)
  fileUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  lampiranUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  lampiranName?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}