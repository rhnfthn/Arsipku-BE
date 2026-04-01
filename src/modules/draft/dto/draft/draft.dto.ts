import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsUUID,
  IsArray,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ============================================================
// GET /draft/list - Query Parameters
// ============================================================
export class GetDraftListQueryDto {
  @IsOptional()
  @IsEnum(['ND', 'DI', 'SDI', 'SDE', 'KA', 'K'], { message: 'Jenis harus ND, DI, SDI, SDE, KA, atau K' })
  jenis?: 'ND' | 'DI' | 'SDI' | 'SDE' | 'KA' | 'K';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lock?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  note?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  arsip?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  priority?: boolean;

  @IsOptional()
  @IsString()
  search?: string; // Search by perihal/nomor

  @IsOptional()
  @IsString()
  days?: string; // Filter by days (default 30) - DEPRECATED, use preset instead

  // Date Range Filter
  @IsOptional()
  @IsDateString({}, { message: 'Format start_date tidak valid (gunakan YYYY-MM-DD)' })
  start_date?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsDateString({}, { message: 'Format end_date tidak valid (gunakan YYYY-MM-DD)' })
  end_date?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    // Normalize preset value: "7 hari" -> "7_hari", etc.
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '_');
    return normalized;
  })
  @IsEnum(['7_hari', '30_hari', '60_hari', '1_tahun', 'semua'], { message: 'Preset tidak valid. Gunakan: 7_hari, 30_hari, 60_hari, 1_tahun, atau semua' })
  preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua';

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return value;
    return String(value).toLowerCase().trim();
  })
  @IsEnum(['terbaru', 'terlama'], { message: 'Sort tidak valid. Gunakan: terbaru atau terlama' })
  sort?: 'terbaru' | 'terlama';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}

// ============================================================
// GET /draft/list - Response
// ============================================================
export class DraftListPenerimaDto {
  position_id: number;
  position_text: string;
  nama: string;
  organization_text: string;
}

export class DraftListItemDto {
  id_naskah: string;
  jenis: 'ND' | 'DI' | 'SDI' | 'SDE' | 'KA' | 'K';
  jenis_text: string;
  penerima: DraftListPenerimaDto[]; // Array of all penerima
  penerima_count: number; // Jumlah penerima
  isi_pesan: string; // Perihal
  tanggal: Date;
  waktu: string; // HH:mm format
  labels: string[]; // Array nama label yang di-assign ke naskah
}

export class GetDraftListResponseDto {
  success: boolean;
  message?: string;
  data: DraftListItemDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    total_semua: number;
    total_per_jenis: {
      ND: number;
      SDI: number;
      SDE: number;
      DI: number;
      KA: number;
      K: number;
    };
  };
}

// ============================================================
// GET /draft/detail/:id - Response
// ============================================================
export class DraftDetailPenerimaDto {
  position_id: number;
  position_text: string;
  nama: string;
  organization_text: string;
}

export class DraftDetailLampiranDto {
  id: string;
  nama_file: string;
  url: string;
  tipe?: string;
}

export class DraftDetailReferensiDto {
  id: string;
  ref_jenis?: string;
  ref_pengirim?: string;
  ref_tanggal?: Date;
  ref_nomor?: string;
  ref_perihal?: string;
}

export class DraftDetailPetunjukDto {
  kode: string;
  label: string;
  catatan?: string;
}

export class DraftDetailDataDto {
  id_naskah: string;
  jenis: 'ND' | 'DI' | 'SDI' | 'SDE' | 'KA' | 'K';
  jenis_text: string;
  nomor?: string;
  tanggal: Date;
  sifat: string;
  perihal?: string;
  konten?: string;
  status: 'draf' | 'pending' | 'final' | 'final_tte';
  
  // Pengirim
  pengirim: {
    position_id: number;
    position_text: string;
    nama: string;
    organization_text: string;
  };

  // Penerima
  penerima: DraftDetailPenerimaDto[];

  // Tembusan (for ND)
  tembusan?: DraftDetailPenerimaDto[];

  // Referensi (for ND, DI)
  referensi?: DraftDetailReferensiDto;

  // Petunjuk Disposisi (for DI)
  petunjuk_disposisi?: DraftDetailPetunjukDto[];

  // Lampiran
  lampiran?: DraftDetailLampiranDto[];

  // Klasifikasi (for ND, SDI, SDE)
  klasifikasi?: string;
  klasifikasi_text?: string;
}

export class GetDraftDetailResponseDto {
  success: boolean;
  message?: string;
  data: DraftDetailDataDto;
}

// ============================================================
// PUT /draft/update - Request Body
// ============================================================
export class UpdateDraftDto {
  @IsNotEmpty({ message: 'ID Naskah harus diisi' })
  @IsUUID('4', { message: 'ID Naskah harus berupa UUID' })
  id_naskah: string;

  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;

  // Action: draft (simpan lagi) atau kirim (ubah status jadi final)
  @IsOptional()
  @IsEnum(['draft', 'kirim'], { message: 'Action harus draft atau kirim' })
  action?: 'draft' | 'kirim';

  // All other fields are optional - will be updated if provided
  // The actual fields depend on jenis (ND, DI, SDI, SDE)
  // We'll handle dynamic validation in service
  [key: string]: any;
}

export class UpdateDraftResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_naskah: string;
    status: 'draf' | 'final';
    updated_at: Date;
  };
}

// ============================================================
// DELETE /draft/delete/:id - Response
// ============================================================
export class DeleteDraftResponseDto {
  success: boolean;
  message: string;
}

// ============================================================
// DELETE /draft/bulk-delete - Bulk Delete Drafts
// ============================================================
export class BulkDeleteDraftDto {
  @IsNotEmpty({ message: 'Position ID harus diisi' })
  @IsNumber({}, { message: 'Position ID harus berupa number' })
  position_id: number;

  @IsNotEmpty({ message: 'Daftar ID naskah harus diisi' })
  @IsArray({ message: 'Daftar ID naskah harus berupa array' })
  @IsUUID('4', { each: true, message: 'Setiap ID naskah harus berupa UUID valid' })
  naskah_ids: string[];
}

export class BulkDeleteDraftResponseDto {
  success: boolean;
  message: string;
  data?: {
    total_requested: number;
    total_deleted: number;
    failed_ids: string[];
  };
}

// ============================================================
// PUT /draft/sign/:id - Sign draft (TTE)
// ============================================================
export class SignDraftDto {
  @IsNotEmpty({ message: 'Position ID harus diisi' })
  @IsNumber({}, { message: 'Position ID harus berupa number' })
  position_id: number;

  @IsOptional()
  @IsString()
  signature_data?: string; // Base64 signature or signature ID
}

export class SignDraftResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_naskah: string;
    status: 'final_tte';
    signed_at: Date;
  };
}
