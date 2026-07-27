import {
  IsEnum,
  IsString,
  IsOptional,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { Keputusan } from '../enums';

/**
 * DTO untuk verifikasi pengusul (AVP/VP/EVP)
 */
export class VerifikasiPengusulDto {
  @IsBoolean() kelengkapanBerkas: boolean;
  @IsBoolean() kesesuaianTujuan: boolean;
  @IsBoolean() periodeWajar: boolean;
  @IsBoolean() suratSah: boolean;
  @IsBoolean() tidakDuplikasi: boolean;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  catatanRevisi?: string; // wajib jika keputusan=REVISI

  @IsEnum(Keputusan)
  keputusan: Keputusan; // SETUJU | REVISI | TOLAK
}