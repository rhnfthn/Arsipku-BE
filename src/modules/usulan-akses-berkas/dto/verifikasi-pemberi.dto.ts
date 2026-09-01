import {
  IsEnum,
  IsString,
  IsOptional,
} from 'class-validator';
import { Keputusan, DurasiPreset } from '../enums';

/**
 * DTO untuk verifikasi pemberi (Sekretaris Pemberi)
 * Checkbox checklist dihapus — cukup keputusan + catatan + durasi.
 */
export class VerifikasiPemberiDto {
  @IsOptional()
  @IsEnum(DurasiPreset)
  durasi_akses_disetujui?: DurasiPreset; // bisa = usulan, atau disesuaikan (opsional untuk TOLAK)

  @IsOptional()
  @IsString()
  custom_tanggal_selesai?: string; // tanggal berakhir custom (jika durasiAksesDisetujui = CUSTOM)

  @IsOptional()
  @IsString()
  catatan_perubahan_durasi?: string; // opsional — fallback ke catatan umum

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsEnum(Keputusan)
  keputusan: Keputusan; // LANJUT | TOLAK
}