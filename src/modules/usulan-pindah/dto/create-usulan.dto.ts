import {
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO untuk membuat usulan pindah arsip inaktif baru.
 */
export class CreateUsulanPindahDto {
  @IsOptional()
  @IsDateString()
  tanggalUsulan?: string;

  @IsInt()
  @Type(() => Number)
  atasanPersnum: number;

  @IsOptional()
  @IsString()
  atasanName?: string;

  @IsOptional()
  @Type(() => Number)
  atasanPositionId?: number;

  @IsString()
  arsipId: string;

  @IsOptional()
  @IsString()
  arsipPerihal?: string;

  @IsOptional()
  @IsString()
  arsipKode?: string;

  @IsOptional()
  @IsDateString()
  tanggalRetensiAktifHabis?: string;

  @IsOptional()
  @IsString()
  keterangan?: string;

  /** Jika true, langsung kirim ke atasan (status MENUNGGU_VERIFIKASI_ATASAN). */
  @IsOptional()
  submit?: boolean;
}
