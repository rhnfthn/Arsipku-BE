import {
  IsEnum,
  IsNumber,
  IsString,
  MinLength,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsOptional,
  IsDateString,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JenisBerkas, DurasiPreset, JenisAkses } from '../enums';

/**
 * DTO untuk setiap verifikator yang dipilih Sekretaris
 * Field `urutan` TIDAK dikirim frontend — backend auto-assign setelah sort
 */
export class VerifikatorDto {
  @IsInt() persnum: number;
  @IsString() levelJabatan: 'AVP' | 'VP' | 'EVP';
}

export class CreateUsulanAksesBerkasDto {
  @IsEnum(JenisBerkas)
  jenisBerkas: JenisBerkas;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  divisiPemberiId?: number; // wajib jika AKTIF; diabaikan jika INAKTIF (backend set otomatis)

  @IsString()
  @MinLength(30)
  @MaxLength(1000)
  tujuanAkses: string;

  @IsEnum(DurasiPreset)
  durasiAkses: DurasiPreset;

  @IsOptional()
  @IsDateString()
  customTanggalSelesai?: string; // hanya untuk CUSTOM

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(JenisAkses, { each: true })
  jenisAkses: JenisAkses[];

  @IsOptional()
  @IsString()
  suratUsulanFileId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VerifikatorDto)
  verifikatorPengusul: VerifikatorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  penerimaAksesTambahan?: number[];
}