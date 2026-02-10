import { IsOptional, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params untuk get nomor
 */
export class GetNomorQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(2000)
  tahun?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sort_by?: string;

  @IsOptional()
  @IsString()
  sort_order?: string;
}

/**
 * Response DTO untuk get nomor
 * Data di-group berdasarkan usulan (request), bukan per nomor
 * Pagination berdasarkan jumlah usulan
 */
export class GetNomorResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    jenis: string | null;
    penandatangan: string | null;
    perihal: string | null;
    tanggal: Date | null;
    nama_pengirim: string | null;
    waktu: Date;
    nomor_list: {
      id: string;
      nomor: string | null;
      status: string;
    }[];
  }[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Response DTO untuk get nomor by id request (menampilkan semua nomor dalam satu request)
 */
export class GetNomorByIdResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    jenis: string | null;
    jabatan: string | null;
    klasifikasi: string | null;
    perihal: string | null;
    tanggal: Date | null;
    jumlah: number | null;
    nomor_list: {
      id: string;
      nomor: string | null;
      status: string;
      file_name: string | null;
      file_text: string | null;
      file_url: string | null;
      created_at: Date;
    }[];
  };
}
