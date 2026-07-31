import {
  IsEnum,
  IsString,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { Keputusan, DurasiPreset } from '../enums';

/**
 * DTO untuk persetujuan pemberi (BOD/BOD-1/BOD-2/BOD-3 berjenjang)
 * Checkbox checklist dihapus — cukup keputusan + catatan.
 * Verifikator berjenjang bisa adjust durasi.
 */
export class PersetujuanPemberiDto {
  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  catatanRevisi?: string; // wajib diisi (min 5 char) jika keputusan=REVISI (dicek di service)

  @IsOptional()
  @IsString()
  catatanKeSE?: string; // catatan khusus dari verifikator ke SE pemberi (saat TOLAK/REVISI)

  @IsEnum(Keputusan)
  keputusan: Keputusan; // SETUJU | REVISI | TOLAK

  // ── Durasi adjustment (opsional, bisa diisi verifikator berjenjang) ──
  @IsOptional()
  @IsEnum(DurasiPreset)
  durasiAksesDisetujui?: DurasiPreset;

  @IsOptional()
  @IsString()
  catatanPerubahanDurasi?: string; // wajib jika durasi diubah
}