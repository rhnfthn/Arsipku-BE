import {
  IsEnum,
  IsNumber,
  IsString,
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
  @IsString() level_jabatan: string; // BOD | BOD-1 | BOD-2 | BOD-3 (atau AVP/VP/EVP untuk backward compat)

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  catatan?: string; // catatan personal untuk verifikator ini (hanya terlihat oleh verifikator itu sendiri)
}

export class CreateUsulanAksesBerkasDto {
  @IsEnum(JenisBerkas)
  jenis_berkas: JenisBerkas;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  divisi_pemberi_id?: number; // wajib jika AKTIF; diabaikan jika INAKTIF (backend set otomatis)

  @IsString()
  @MaxLength(255)
  judul_usulan: string; // judul usulan (wajib, ditampilkan di tabel & keyword pencarian)

  @IsString()
  @MaxLength(2000)
  tujuan_akses: string;

  @IsEnum(DurasiPreset)
  durasi_akses: DurasiPreset;

  @IsOptional()
  @IsDateString()
  custom_tanggal_selesai?: string; // hanya untuk CUSTOM

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(JenisAkses, { each: true })
  jenis_akses: JenisAkses[];

  @IsOptional()
  @IsString()
  surat_usulan_file_id?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VerifikatorDto)
  verifikator_pengusul: VerifikatorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  penerima_akses_tambahan?: number[];
}