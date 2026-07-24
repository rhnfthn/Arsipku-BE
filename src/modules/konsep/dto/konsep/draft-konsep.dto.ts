import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LampiranDto } from './create-konsep.dto';

// ============================================================
// CREATE DRAFT KONSEP
// ============================================================

/**
 * DTO untuk membuat draft konsep
 * Draft konsep adalah konsep yang belum dikirim ke pemeriksa
 */
export class CreateDraftKonsepDto {
  // ============ WAJIB ============

  @IsNotEmpty()
  @IsEnum(['ND', 'SDI', 'SDE'])
  jenis: 'ND' | 'SDI' | 'SDE';

  @IsNotEmpty()
  @IsNumber()
  from_position_id: number; // Pembuat konsep (yang simpan draft)

  // ============ OPSIONAL - PENERIMA KONSEP ============

  @IsOptional()
  @IsNumber()
  to_position_id?: number; // Penerima konsep (atasan) - bisa diisi nanti

  @IsOptional()
  @IsNumber()
  pengirim_position_id?: number; // Pengirim naskah final (bisa beda dari from_position_id)

  // ============ REFERENSI DISPOSISI ============

  @IsOptional()
  @IsString()
  id_disposisi_referensi?: string; // ID naskah disposisi (DI) yang diterima langsung

  // ============ KONTEN NASKAH ============

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsEnum(['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka'])
  sifat?: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka';

  // ============ KOP & TANDA TANGAN ============

  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

  @IsOptional()
  @IsString()
  nama_tempat?: string;

  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  // ============ LAMPIRAN ============

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[]; // RECOMMENDED: Array of lampiran IDs dari POST /upload-temporary-konsep

  // ============ PENERIMA SURAT FINAL ============

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  penerima_position_ids?: number[]; // Penerima akhir surat (berbeda dengan to_position_id yang adalah penerima konsep)

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tembusan_position_ids?: number[]; // Tembusan surat

  // ============ GRUP PENERIMA ============

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  penerima_grup?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  tembusan_grup?: string[];

  // ============ CATATAN ============

  @IsOptional()
  @IsString()
  catatan?: string; // Catatan dari konseptor ke pemeriksa

  // ============ TAMBAHAN UNTUK SDI/SDE ============

  @IsOptional()
  @IsString()
  kepada_yth?: string; // Untuk SDI/SDE

  @IsOptional()
  @IsString()
  alamat?: string; // Untuk SDE

  // ============ REFERENSI (untuk ND) ============

  @IsOptional()
  @IsString()
  dari?: string; // Dari siapa (untuk ND)

  @IsOptional()
  @IsString()
  tembusan?: string; // Tembusan text (untuk ND/SDI/SDE)

  // ============ TANGGAL ============

  @IsOptional()
  @IsString()
  tgl?: string; // Format YYYY-MM-DD, default hari ini

  // ============ TANDA TANGAN ============

  @IsOptional()
  @IsString()
  tanda_tangan?: string; // URL/path tanda tangan
}

// ============================================================
// UPDATE DRAFT KONSEP
// ============================================================

/**
 * DTO untuk update draft konsep
 */
export class UpdateDraftKonsepDto {
  @IsNotEmpty()
  @IsNumber()
  from_position_id: number; // Pembuat konsep (untuk validasi ownership)

  // Action: draft (simpan lagi) atau kirim (ubah ke create flow)
  @IsOptional()
  @IsEnum(['draft', 'kirim'], { message: 'Action harus draft atau kirim' })
  action?: 'draft' | 'kirim';

  // Semua field lainnya sama dengan CreateDraftKonsepDto (opsional)
  @IsOptional()
  @IsEnum(['ND', 'SDI', 'SDE'])
  jenis?: 'ND' | 'SDI' | 'SDE';

  @IsOptional()
  @IsNumber()
  to_position_id?: number;

  @IsOptional()
  @IsNumber()
  pengirim_position_id?: number;

  @IsOptional()
  @IsString()
  id_disposisi_referensi?: string;

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsEnum(['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka'])
  sifat?: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka';

  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

  @IsOptional()
  @IsString()
  nama_tempat?: string;

  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  penerima_position_ids?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tembusan_position_ids?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  penerima_grup?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value;
  })
  tembusan_grup?: string[];

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  kepada_yth?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  dari?: string;

  @IsOptional()
  @IsString()
  tembusan?: string;

  @IsOptional()
  @IsString()
  tgl?: string;

  @IsOptional()
  @IsString()
  tanda_tangan?: string;
}

// ============================================================
// GET DRAFT LIST QUERY
// ============================================================

export class GetDraftKonsepListQueryDto {
  @IsOptional()
  @IsEnum(['ND', 'SDI', 'SDE'], { message: 'Jenis harus ND, SDI, atau SDE' })
  jenis?: 'ND' | 'SDI' | 'SDE';

  @IsOptional()
  @IsString()
  search?: string; // Search by perihal

  @IsOptional()
  @IsDateString(
    {},
    { message: 'Format start_date tidak valid (gunakan YYYY-MM-DD)' },
  )
  start_date?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'Format end_date tidak valid (gunakan YYYY-MM-DD)' },
  )
  end_date?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '_');
    return normalized;
  })
  @IsEnum(['7_hari', '30_hari', '60_hari', '1_tahun', 'semua'], {
    message:
      'Preset tidak valid. Gunakan: 7_hari, 30_hari, 60_hari, 1_tahun, atau semua',
  })
  preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

// ============================================================
// RESPONSE DTOs
// ============================================================

/**
 * Response DTO untuk create draft konsep
 */
export class CreateDraftKonsepResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_draft: string; // ID naskah draft (naskah asli, jenis ND/SDI/SDE dengan status draf)
    jenis: 'ND' | 'SDI' | 'SDE';
    from: {
      position_id: number;
      position_text: string;
      nama: string | null;
    };
    status: 'draf';
    created_at: Date;
  };
}

/**
 * Response DTO untuk update draft konsep
 */
export class UpdateDraftKonsepResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_draft: string;
    status: 'draf' | 'final';
    updated_at: Date;
    // Jika action='kirim', include konsep info
    id_konsep?: string;
  };
}

/**
 * Response DTO untuk item dalam list draft konsep
 */
export class DraftKonsepListItemDto {
  id_draft: string;
  id_sirkulasi: string | null;
  jenis: 'ND' | 'SDI' | 'SDE';
  jenis_text: string;
  perihal: string;
  sifat: string;
  klasifikasi_text: string | null;
  tanggal: Date;
  waktu: string; // HH:mm format
  penerima_count: number;
  lampiran_count: number;
}

/**
 * Response DTO untuk list draft konsep
 */
export class GetDraftKonsepListResponseDto {
  success: boolean;
  message?: string;
  data: DraftKonsepListItemDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Response DTO untuk detail draft konsep
 */
export class DraftKonsepDetailDataDto {
  id_draft: string;
  jenis: 'ND' | 'SDI' | 'SDE';
  jenis_text: string;

  // Pengirim konsep
  from_position_id: number;
  from_position_text: string;
  from_nama: string | null;
  from_organization_text: string | null;

  // Penerima konsep (jika sudah diisi)
  to_position_id?: number;
  to_position_text?: string;
  to_nama?: string | null;

  // Konten naskah
  perihal: string | null;
  konten: string | null;
  sifat: string;
  klasifikasi: string | null;
  klasifikasi_text: string | null;
  tanggal: Date;

  // Pengirim naskah final
  pengirim?: {
    position_id: number;
    position_text: string;
    nama: string | null;
    organization_text: string | null;
  };

  // Penerima naskah final
  penerima?: Array<{
    position_id: number;
    position_text: string;
    nama: string | null;
  }>;
  penerima_grup?: Array<{
    id: string;
    nama: string;
    position_ids: number[];
  }>;
  penerima_text?: string; // kepada_yth for SDE

  // Tembusan
  tembusan?: Array<{
    position_id: number;
    position_text: string;
    nama: string | null;
  }>;
  tembusan_grup?: Array<{
    id: string;
    nama: string;
    position_ids: number[];
  }>;
  tembusan_text?: string;

  // Lampiran
  lampiran?: Array<{
    id: string;
    nama_file: string;
    url: string;
  }>;

  // Referensi disposisi
  disposisi_referensi?: {
    id: string;
    nomor: string;
    perihal: string | null;
    pengirim?: string | null;
    tanggal?: Date | null;
    final_pdf_url?: string | null;
  };

  // Catatan
  catatan: string | null;

  // Metadata
  status: 'draf';
  created_at: Date;
  updated_at: Date;
}

export class GetDraftKonsepDetailResponseDto {
  success: boolean;
  message?: string;
  data: DraftKonsepDetailDataDto;
}

/**
 * Response DTO untuk delete draft konsep
 */
export class DeleteDraftKonsepResponseDto {
  success: boolean;
  message: string;
}

/**
 * Response DTO untuk bulk delete draft konsep
 */
export class BulkDeleteDraftKonsepResponseDto {
  success: boolean;
  message: string;
  data?: {
    total_requested: number;
    total_deleted: number;
    failed_ids: string[];
  };
}
