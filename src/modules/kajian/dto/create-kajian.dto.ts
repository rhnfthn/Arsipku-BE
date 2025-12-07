import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  ArrayMinSize,
  ValidateNested,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

// Enum untuk sifat naskah
export enum SifatNaskah {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

// DTO untuk lampiran (jika ada file)
export class LampiranKajianDto {
  @IsNotEmpty({ message: 'Nama file harus diisi' })
  @IsString()
  nama_file: string;

  @IsNotEmpty({ message: 'URL file harus diisi' })
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  tipe?: string; // pdf/doc/img
}

/**
 * Main DTO untuk send-message kajian
 * 
 * Kajian (KA): Korespondensi dari fungsional/staf ke managerial/fungsional 
 * dalam Sub Area yang sama, dan atasan langsung/tidak langsung yang sama
 * 
 * Pola pengiriman:
 * - Staff/Fungsional → Managerial ATASAN (atasan langsung/tidak langsung)
 * - Staff/Fungsional → Fungsional ATASAN (atasan langsung/tidak langsung)
 * - Managerial → Managerial ATASAN (atasan langsung/tidak langsung)
 * 
 * TIDAK BISA ke:
 * - Sesama rekan/setingkat
 * - Bawahan
 */
export class CreateKajianDto {
  // Pengirim - menggunakan position_id
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;

  // Penerima - array of position_id (hanya ATASAN)
  @IsArray({ message: 'Penerima harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  @IsNumber({}, { each: true, message: 'Setiap penerima harus berupa position_id (number)' })
  penerima_position_ids: number[];

  // ============================================================
  // FIELD NASKAH UTAMA
  // ============================================================

  // Tanggal Kajian
  @IsNotEmpty({ message: 'Tanggal kajian harus diisi' })
  @IsDateString({}, { message: 'Format tanggal tidak valid' })
  tanggal: string;

  // Klasifikasi (opsional)
  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  // Sifat Naskah
  @IsNotEmpty({ message: 'Sifat naskah harus diisi' })
  @IsEnum(SifatNaskah, { message: 'Sifat naskah tidak valid' })
  sifat: SifatNaskah;

  // Nomor Naskah
  @IsOptional()
  @IsString()
  nomor?: string;

  // Perihal
  @IsNotEmpty({ message: 'Perihal harus diisi' })
  @IsString()
  perihal: string;

  // Konten/Isi Kajian
  @IsOptional()
  @IsString()
  konten?: string;

  // Lampiran files
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranKajianDto)
  lampiran?: LampiranKajianDto[];

  // ============================================================
  // FIELD TAMBAHAN UNTUK TABEL KA (jika ada)
  // ============================================================

  // Kop Naskah
  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_judul?: string;

  // Penandatangan
  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  // Paraf
  @IsOptional()
  @IsString()
  paraf?: string;
}
