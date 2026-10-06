import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LampiranDto } from './create-konsep.dto';

/**
 * DTO untuk forward konsep ke atasan
 *
 * Penerima konsep bisa meneruskan (forward) ke atasannya lagi
 * User dapat mengubah value sebelum forward
 */
export class ForwardKonsepDto {
  // ============ WAJIB ============

  @IsNotEmpty()
  @IsNumber()
  from_position_id: number; // Penerima saat ini (yang forward)

  @IsNotEmpty()
  @IsNumber()
  to_position_id: number; // Atasan berikutnya (tujuan forward)

  // ============ TURUNKAN (delegasi ke bawahan) ============

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
  })
  is_turunkan?: boolean; // true = turunkan ke bawahan (aksi='turunkan'), false/undefined = forward ke atasan (aksi='forward')

  // ============ KONTEN NASKAH (bisa diubah) ============

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsEnum(['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka'])
  sifat?: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka';

  // ============ KOP & TANDA TANGAN ============

  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

  @IsOptional()
  @IsString()
  nama_tempat?: string;

  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  // ============ LAMPIRAN ============

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[]; // RECOMMENDED: Array of lampiran IDs dari POST /upload-temporary-konsep

  /** Keterangan lampiran pada naskah, terpisah dari daftar file. */
  @IsOptional()
  @IsString()
  lampiran_text?: string;

  // ============ PENERIMA SURAT FINAL ============

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  penerima_position_ids?: number[]; // Penerima akhir surat (berbeda dengan to_position_id yang adalah penerima konsep)

  // Penerima eksternal (khusus SDE) — array of eksternal.id (UUID string).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  penerima_eksternal?: string[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tembusan_position_ids?: number[]; // Tembusan surat

  // ============ GRUP PENERIMA ============

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  penerima_grup?: string[]; // Array of grup_penerima UUIDs for penerima

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  tembusan_grup?: string[]; // Array of grup_penerima UUIDs for tembusan

  // ============ CATATAN ============

  @IsOptional()
  @IsString()
  catatan?: string; // Catatan untuk atasan

  // ============ TAMBAHAN UNTUK SDI/SDE ============

  @IsOptional()
  @IsString()
  kepada_yth?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  // ============ REFERENSI (untuk ND) ============

  @IsOptional()
  @IsString()
  dari?: string;

  @IsOptional()
  @IsString()
  tembusan?: string;

  // ============ TANDA TANGAN ============

  @IsOptional()
  @IsString()
  tanda_tangan?: string;
}
