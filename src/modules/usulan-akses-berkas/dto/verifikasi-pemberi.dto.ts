import {
  IsEnum,
  IsString,
  IsOptional,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { Keputusan, DurasiPreset } from '../enums';

/**
 * DTO untuk verifikasi pemberi (Sekretaris Pemberi)
 */
export class VerifikasiPemberiDto {
  @IsBoolean() berkasTersedia: boolean;
  @IsBoolean() tidakAdaPembatasan: boolean;
  @IsBoolean() tujuanMemadai: boolean;
  @IsBoolean() tidakBentrokRetensi: boolean;
  @IsBoolean() disetujuiLanjut: boolean;

  @IsEnum(DurasiPreset)
  durasiAksesDisetujui: DurasiPreset; // bisa = usulan, atau disesuaikan

  @IsOptional()
  @IsString()
  catatanPerubahanDurasi?: string; // wajib jika durasiAksesDisetujui ≠ durasiAkses

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsEnum(Keputusan)
  keputusan: Keputusan; // LANJUT | TOLAK
}