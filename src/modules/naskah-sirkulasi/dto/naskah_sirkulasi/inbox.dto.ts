import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params untuk filter inbox
 */
export class InboxQueryDto {
  @IsOptional()
  @IsEnum(['ND', 'SDI', 'SDE', 'DI', 'KA'], { message: 'Jenis naskah tidak valid' })
  jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';

  @IsOptional()
  @IsEnum(['terbaca', 'belum_terbaca'], { message: 'Status baca tidak valid' })
  status_baca?: 'terbaca' | 'belum_terbaca';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}

/**
 * Item dalam daftar inbox
 */
export class InboxItemDto {
  id_sirkulasi: string;
  id_naskah: string;
  
  // Info Naskah (dari tabel naskah)
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  jenis_label: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  sifat: string;
  status: string;
  lampiran: string | null;
  
  // Info Pengirim
  pengirim: {
    position_id: string;
    position_text: string;
    organization_text: string;
    nama: string;
  };

  // Info Penerima (data user yang menerima - current user)
  penerima: {
    position_id: string;
    persnum: number;
    nama: string;
    position_text: string;
    organization_text: string;
  };

  // Kepada - Semua penerima yang dituju oleh pengirim (termasuk current user)
  kepada: Array<{
    position_id: string;
    nama: string;
    position_text: string;
    organization_text: string;
  }>;
  
  // Status Baca
  status_baca: 'terbaca' | 'belum_terbaca';
  read_time: Date | null;
  
  // Flags
  is_favorit: boolean;
  is_arsip: boolean;
  is_note: boolean;
  
  // Labels - array nama label yang di-assign ke naskah
  labels: string[];
  
  // Priority flag (hanya untuk jenis='DI')
  is_priority?: boolean;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

/**
 * Response DTO untuk inbox
 */
export class InboxResponseDto {
  success: boolean;
  message: string;
  data: {
    items: InboxItemDto[];
    summary: {
      total_semua: number;
      total_belum_dibaca: number;
      total_per_jenis: {
        ND: number;
        SDI: number;
        SDE: number;
        DI: number;
        KA: number;
      };
    };
  };
}
