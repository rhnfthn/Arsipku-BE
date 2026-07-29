import {
  IsEnum,
  IsString,
  IsOptional,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { Keputusan } from '../enums';

/**
 * DTO untuk persetujuan pemberi (AVP/VP/EVP)
 */
export class PersetujuanPemberiDto {
  @IsBoolean() berkasSesuai: boolean;
  @IsBoolean() tidakMelanggarKebijakan: boolean;
  @IsBoolean() peminjamanTidakBerlebihan: boolean;
  @IsBoolean() sudahDiverifikasiSekretaris: boolean;
  @IsBoolean() disetujuiDiberikan: boolean;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  catatanRevisi?: string; // wajib diisi (min 5 char) jika keputusan=REVISI (dicek di service)

  @IsEnum(Keputusan)
  keputusan: Keputusan; // SETUJU | REVISI | TOLAK
}