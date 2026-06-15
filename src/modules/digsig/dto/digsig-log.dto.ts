import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsUUID,
  MaxLength,
  IsIP,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO untuk membuat log digsig baru
 */
export class CreateDigsigLogDto {
  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsInt()
  @IsNotEmpty({ message: 'User persnum wajib diisi' })
  userPersnum: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  userName?: string;

  @IsString()
  @IsNotEmpty({ message: 'API endpoint wajib diisi' })
  @MaxLength(100)
  apiEndpoint: string;

  @IsOptional()
  @IsUUID()
  idNaskah?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nomorNaskah?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jenisNaskah?: string;

  @IsEnum(['sign', 'verify', 'download', 'upload'], {
    message: 'Action harus salah satu dari: sign, verify, download, upload',
  })
  @IsNotEmpty({ message: 'Action wajib diisi' })
  action: 'sign' | 'verify' | 'download' | 'upload';

  @IsEnum(['sukses', 'gagal', 'pending'], {
    message: 'Status harus salah satu dari: sukses, gagal, pending',
  })
  @IsOptional()
  status?: 'sukses' | 'gagal' | 'pending';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsObject()
  bsreResponse?: Record<string, any>;
}

/**
 * DTO untuk filter/query log digsig
 */
export class FilterDigsigLogDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userPersnum?: number;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsUUID()
  idNaskah?: string;

  @IsOptional()
  @IsString()
  nomorNaskah?: string;

  @IsOptional()
  @IsString()
  jenisNaskah?: string;

  @IsOptional()
  @IsEnum(['sign', 'verify', 'download', 'upload'])
  action?: 'sign' | 'verify' | 'download' | 'upload';

  @IsOptional()
  @IsEnum(['sukses', 'gagal', 'pending'])
  status?: 'sukses' | 'gagal' | 'pending';

  @IsOptional()
  @IsString()
  startDate?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsString()
  endDate?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsString()
  search?: string; // Search by nomor_naskah, user_name, note

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;
}

/**
 * Response DTO untuk single log
 */
export class DigsigLogResponseDto {
  id: string;
  tanggal: Date;
  ipAddress: string | null;
  userPersnum: number;
  userName: string | null;
  apiEndpoint: string;
  idNaskah: string | null;
  nomorNaskah: string | null;
  jenisNaskah: string | null;
  action: string;
  status: string;
  note: string | null;
  createdAt: Date;
}

/**
 * Response DTO untuk paginated list
 */
export class DigsigLogPaginatedResponseDto {
  data: DigsigLogResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
