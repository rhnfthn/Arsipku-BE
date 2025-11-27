import { IsNotEmpty, IsArray, IsOptional, IsString, IsBoolean, IsEnum, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Enum untuk sifat surat
export enum SifatSurat {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

// Enum untuk jenis surat referensi
export enum JenisReferensi {
  ND = 'ND',
  SDI = 'SDI',
  SDE = 'SDE',
}

// DTO untuk data naskah
export class NaskahDataDto {
  @IsNotEmpty({ message: 'Klasifikasi harus diisi' })
  @IsString()
  klasifikasi: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsNotEmpty({ message: 'Sifat surat harus diisi' })
  @IsEnum(SifatSurat, { message: 'Sifat tidak valid' })
  sifat: SifatSurat;

  @IsOptional()
  @IsString()
  lampiran?: string;

  @IsNotEmpty({ message: 'Perihal harus diisi' })
  @IsString()
  perihal: string;

  @IsNotEmpty({ message: 'Konten harus diisi' })
  @IsString()
  konten: string;

  @IsOptional()
  @IsString()
  tempat?: string;

  @IsOptional()
  @IsBoolean()
  english?: boolean;
}

// DTO untuk referensi surat
export class ReferensiDto {
  @IsNotEmpty()
  @IsEnum(JenisReferensi)
  ref_jenis: JenisReferensi;

  @IsNotEmpty()
  @IsString()
  ref_pengirim: string;

  @IsNotEmpty()
  @IsString()
  ref_tanggal: string;

  @IsNotEmpty()
  @IsString()
  ref_nomor: string;

  @IsOptional()
  @IsString()
  ref_perihal?: string;
}

// Main DTO untuk send-message
export class CreateNotaDinasDto {
  @IsNotEmpty({ message: 'Pengirim harus diisi' })
  pengirim: number;

  @IsArray({ message: 'Penerima harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  penerima: number[];

  @IsOptional()
  @IsArray()
  tembusan?: number[];

  @IsNotEmpty({ message: 'Data naskah harus diisi' })
  @ValidateNested()
  @Type(() => NaskahDataDto)
  naskah: NaskahDataDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferensiDto)
  referensi?: ReferensiDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_files?: string[];
}
