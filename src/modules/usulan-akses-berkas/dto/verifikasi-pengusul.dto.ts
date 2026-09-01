import {
  IsEnum,
  IsString,
  IsOptional,
} from 'class-validator';
import { Keputusan } from '../enums';

/**
 * DTO untuk verifikasi pengusul (BOD/BOD-1/BOD-2/BOD-3 berjenjang)
 * Checkbox checklist dihapus — cukup keputusan + catatan.
 */
export class VerifikasiPengusulDto {
  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  catatan_revisi?: string; // wajib diisi (min 5 char) jika keputusan=REVISI (dicek di service)

  @IsOptional()
  @IsString()
  catatan_ke_se?: string; // catatan khusus dari verifikator ke SE pengusul (saat TOLAK/REVISI)

  @IsEnum(Keputusan)
  keputusan: Keputusan; // SETUJU | REVISI | TOLAK
}