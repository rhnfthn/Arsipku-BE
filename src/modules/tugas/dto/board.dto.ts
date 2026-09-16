import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import { TugasBoardFilter, TugasBoardType } from '../enums';
import { Trim } from './tugas-validation';

export class CreateBoardDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nama: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  deskripsi?: string;

  @IsOptional()
  @IsEnum(TugasBoardType)
  tipe?: TugasBoardType;

  /** Nama ikon lucide — divalidasi whitelist di FE; BE hanya batasi panjang. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'icon harus slug kecil tanpa spasi' })
  icon?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsOptional()
  @Matches(/^#[0-9A-F]{6}$/)
  warna?: string;
}

export class UpdateBoardDto {
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nama?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  deskripsi?: string;

  @IsOptional()
  @IsEnum(TugasBoardType)
  tipe?: TugasBoardType;

  /** Nama ikon lucide — divalidasi whitelist di FE; BE hanya batasi panjang. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'icon harus slug kecil tanpa spasi' })
  icon?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsOptional()
  @Matches(/^#[0-9A-F]{6}$/)
  warna?: string;
}

export class QueryBoardDto {
  @IsOptional()
  @IsEnum(TugasBoardFilter)
  filter: TugasBoardFilter = TugasBoardFilter.SEMUA;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
