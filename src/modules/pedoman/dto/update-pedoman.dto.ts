import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  MaxLength,
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