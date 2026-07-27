import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO filter untuk "Riwayat Aktivitas Saya" (Admin & User).
 *
 * Berbeda dari AuditFilterDto:
 *  - Tidak ada userId/persnum/userRole (di-set otomatis dari JWT)
 *  - Field tanggal: fromDate / toDate (bukan startDate/endDate)
 *  - action/module/status bersifat string bebas (tidak @IsEnum) agar
 *    tidak reject nilai enum baru yang belum terdaftar
 */
export class MyActivityFilterDto {
  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}