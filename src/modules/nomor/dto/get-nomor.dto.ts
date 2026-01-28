import { IsOptional, IsInt, Min } from 'class-validator';
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
}

/**
 * Response DTO untuk get nomor
 */
export class GetNomorResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    id_request: string | null;
    jenis: string | null;
    jabatan: string | null;
    klasifikasi: string | null;
    perihal: string | null;
    tanggal: Date | null;
    nomor: string | null;
    nama_pengirim: string | null;
    waktu: Date;
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
