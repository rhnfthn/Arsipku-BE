import { IsOptional, IsEnum } from 'class-validator';

/**
 * Query params untuk filter sent messages (kotak keluar)
 */
export class SentMessageQueryDto {
  @IsOptional()
  @IsEnum(['ND', 'SDI', 'SDE', 'DI', 'KA'], { message: 'Jenis naskah tidak valid' })
  jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';

  @IsOptional()
  @IsEnum(['terbaca', 'belum_terbaca'], { message: 'Status baca tidak valid' })
  status_baca?: 'terbaca' | 'belum_terbaca';
}

/**
 * Info sirkulasi singkat
 */
export class SirkulasiInfoDto {
  position_id: string;
  position_text: string;
  organization_text: string;
  nama: string | null;
}

/**
 * Info penerima dengan status baca
 */
export class PenerimaWithStatusDto {
  position_id: string;
  position_text: string;
  organization_text: string;
  nama: string | null;
  status_baca: 'terbaca' | 'belum_terbaca';
  read_time: Date | null;
}

/**
 * Item dalam daftar sent messages
 */
export class SentMessageItemDto {
  id_naskah: string;
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  jenis_label: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  sifat: string;
  status: string;
  lampiran: number;
  pengirim: SirkulasiInfoDto;
  penerima: PenerimaWithStatusDto[];
  summary_baca: {
    total: number;
    terbaca: number;
    belum_terbaca: number;
  };
  favorit: boolean;
  note: boolean;
  arsip: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Response DTO untuk sent messages (kotak keluar)
 */
export class SentMessageResponseDto {
  success: boolean;
  message: string;
  data: {
    items: SentMessageItemDto[];
    summary: {
      total_semua: number;
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
