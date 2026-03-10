import { IsOptional, IsString, IsEnum, IsDateString, IsBoolean, IsNumber, IsArray, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Jenis dokumen yang bisa dicari
 */
export enum JenisNaskahEnum {
  ND = 'ND',     // Nota Dinas
  SDI = 'SDI',   // Surat Dinas Internal
  SDE = 'SDE',   // Surat Dinas Eksternal
  DI = 'DI',     // Disposisi Internal
  KA = 'KA',     // Kajian
  K = 'K',       // Konsep
}

/**
 * Sifat kerahasiaan dokumen
 */
export enum SifatNaskahEnum {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

/**
 * Status dokumen
 */
export enum StatusNaskahEnum {
  DRAF = 'draf',
  FINAL = 'final',
  FINAL_TTE = 'final_tte',
}

/**
 * Rentang waktu pencarian (seperti Gmail Date Within)
 */
export enum DateWithinEnum {
  ONE_DAY = '1_day',
  THREE_DAYS = '3_days',
  ONE_WEEK = '1_week',
  TWO_WEEKS = '2_weeks',
  ONE_MONTH = '1_month',
  TWO_MONTHS = '2_months',
  SIX_MONTHS = '6_months',
  ONE_YEAR = '1_year',
}

/**
 * Tipe ukuran file
 */
export enum SizeTypeEnum {
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
}

/**
 * Unit ukuran file
 */
export enum SizeUnitEnum {
  KB = 'KB',
  MB = 'MB',
  GB = 'GB',
}

/**
 * Kategori filter
 */
export enum KategoriEnum {
  SUDAH_TINDAK_LANJUT = 'sudah_tindak_lanjut',
  BELUM_TINDAK_LANJUT = 'belum_tindak_lanjut',
  SUDAH_DIBACA = 'sudah_dibaca',
  BELUM_DIBACA = 'belum_dibaca',
}

/**
 * Scope pencarian (All Mail di Gmail)
 */
export enum SearchScopeEnum {
  ALL = 'all',               // Semua naskah (termasuk archived)
  INBOX = 'inbox',           // Naskah masuk (saya sebagai penerima) - exclude archived
  SENT = 'sent',             // Naskah keluar (saya sebagai pengirim) - exclude archived
  DRAFT = 'draft',           // Draft - exclude archived
  ARCHIVED = 'archived',     // Arsip saja
  FAVORITE = 'favorite',     // Favorit (bisa include archived)
  ACTIVE = 'active',         // Naskah aktif (inbox + sent + draft) exclude archived
  PRIORITY = 'priority',     // Disposisi prioritas (jenis=DI dan is_priority=1)
}

/**
 * DTO untuk Global Search
 * Mirip dengan Gmail Advanced Search
 */
export class GlobalSearchDto {
  // === SEARCH BY TEXT ===

  /**
   * Pencarian global (mencari di semua field text)
   * Seperti "Search mail" di Gmail
   */
  @IsOptional()
  @IsString()
  keyword?: string;

  /**
   * Pencarian di perihal/subject saja
   */
  @IsOptional()
  @IsString()
  perihal?: string;

  /**
   * "Has the words" - konten harus mengandung kata-kata ini
   */
  @IsOptional()
  @IsString()
  hasWords?: string;

  /**
   * "Doesn't have" - konten TIDAK boleh mengandung kata-kata ini
   */
  @IsOptional()
  @IsString()
  doesntHave?: string;

  // === SEARCH BY SENDER/RECEIVER ===

  /**
   * Dari (pengirim) - nama atau organization
   */
  @IsOptional()
  @IsString()
  from?: string;

  /**
   * Kepada (penerima) - nama atau organization
   */
  @IsOptional()
  @IsString()
  to?: string;

  /**
   * Tembusan
   */
  @IsOptional()
  @IsString()
  cc?: string;

  /**
   * Filter pengirim berdasarkan list position
   * Contoh: [123, 321, 1231]
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return value.split(',').map(Number);
    return [Number(value)];
  })
  @IsArray()
  @IsInt({ each: true })
  pengirimPosition?: number[];

  /**
   * Filter penerima berdasarkan list position
   * Contoh: [333, 444]
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return value.split(',').map(Number);
    return [Number(value)];
  })
  @IsArray()
  @IsInt({ each: true })
  penerimaPosition?: number[];

  // === SEARCH BY DOCUMENT TYPE ===

  /**
   * Jenis naskah: ND, SDI, SDE, DI, KA, K
   */
  @IsOptional()
  @IsEnum(JenisNaskahEnum)
  jenis?: JenisNaskahEnum;

  /**
   * Sifat kerahasiaan: sangat_rahasia, rahasia, terbatas, biasa, terbuka
   */
  @IsOptional()
  @IsEnum(SifatNaskahEnum)
  sifat?: SifatNaskahEnum;

  /**
   * Status dokumen: draf, final, final_tte
   */
  @IsOptional()
  @IsEnum(StatusNaskahEnum)
  status?: StatusNaskahEnum;

  /**
   * Klasifikasi dokumen
   */
  @IsOptional()
  @IsString()
  klasifikasi?: string;

  // === SEARCH BY DATE ===

  /**
   * Tanggal mulai (format: YYYY-MM-DD)
   */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /**
   * Tanggal akhir (format: YYYY-MM-DD)
   */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /**
   * Date Within - rentang waktu dari tanggal referensi
   * Seperti Gmail "Date within 1 day of..."
   */
  @IsOptional()
  @IsEnum(DateWithinEnum)
  dateWithin?: DateWithinEnum;

  /**
   * Tanggal referensi untuk dateWithin (format: YYYY-MM-DD)
   */
  @IsOptional()
  @IsDateString()
  dateReference?: string;

  // === SEARCH BY NOMOR ===

  /**
   * Nomor surat
   */
  @IsOptional()
  @IsString()
  nomor?: string;

  // === SEARCH BY ATTACHMENT/SIZE ===

  /**
   * Hanya cari yang punya lampiran
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasAttachment?: boolean;

  /**
   * Tipe ukuran: greater_than atau less_than
   */
  @IsOptional()
  @IsEnum(SizeTypeEnum)
  sizeType?: SizeTypeEnum;

  /**
   * Ukuran file
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sizeValue?: number;

  /**
   * Unit ukuran: KB, MB, GB
   */
  @IsOptional()
  @IsEnum(SizeUnitEnum)
  sizeUnit?: SizeUnitEnum;

  // === SEARCH SCOPE ===

  /**
   * Position ID untuk filter (opsional)
   * Jika tidak diberikan, akan menggunakan position dari JWT
   * Berguna untuk user dengan multiple jabatan atau delegasi
   */
  @IsOptional()
  @IsString()
  position_id?: string;

  /**
   * Scope pencarian: all, inbox, sent, draft, archived, favorite
   */
  @IsOptional()
  @IsEnum(SearchScopeEnum)
  scope?: SearchScopeEnum;

  /**
   * Position ID user yang sedang search (untuk filter inbox/sent)
   */
  @IsOptional()
  @IsString()
  positionId?: string;

  // === KATEGORI FILTER ===

  /**
   * Filter berdasarkan kategori:
   * - sudah_tindak_lanjut: Naskah yang sudah ditindaklanjuti
   * - belum_tindak_lanjut: Naskah yang belum ditindaklanjuti
   * - sudah_dibaca: Naskah yang sudah dibaca
   * - belum_dibaca: Naskah yang belum dibaca
   */
  @IsOptional()
  @IsEnum(KategoriEnum)
  kategori?: KategoriEnum;

  // === LABEL FILTER (Gmail-style Hierarchical) ===

  /**
   * Filter by label path (hierarchical, slash-separated)
   * Examples:
   * - "Work" returns all documents labeled Work, Work/Projects, Work/Invoices, etc.
   * - "Work/Projects/Q1" returns only that specific label
   */
  @IsOptional()
  @IsString()
  label?: string;

  // === UNREAD STATUS FILTER ===

  /**
   * Filter by read status
   * - true: Only read documents
   * - false: Only unread documents
   * - undefined: All documents (no filter)
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isRead?: boolean;

  /**
   * Organization ID user yang sedang search
   */
  @IsOptional()
  @IsString()
  organizationId?: string;

  // === SEARCH BY ORGANIZATION ===

  /**
   * Area pengirim
   */
  @IsOptional()
  @IsString()
  areaFrom?: string;

  /**
   * Sub Area pengirim
   */
  @IsOptional()
  @IsString()
  subAreaFrom?: string;

  /**
   * Organization pengirim
   */
  @IsOptional()
  @IsString()
  organizationFrom?: string;

  // === PAGINATION ===

  /**
   * Halaman (default: 1)
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  /**
   * Jumlah per halaman (default: 20, max: 100)
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // === SORTING ===

  /**
   * Sort by field: tanggal, nomor, perihal, jenis
   */
  @IsOptional()
  @IsString()
  sortBy?: string = 'tanggal';

  /**
   * Sort order: ASC atau DESC
   */
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

/**
 * Sumber/asal naskah untuk user
 */
export enum NaskahSourceEnum {
  INBOX = 'inbox',       // Naskah masuk (user sebagai penerima/tembusan)
  SENT = 'sent',         // Naskah keluar (user sebagai pengirim)
  DRAFT = 'draft',       // Draft naskah
  CC = 'cc',             // Tembusan
}

/**
 * Response DTO untuk hasil pencarian
 */
export class SearchResultItemDto {
  id: string;
  jenis: string;
  jenisText: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  sifat: string;
  status: string;
  klasifikasi: string | null;
  klasifikasiText: string | null;

  // Pengirim
  pengirim: {
    nama: string | null;
    jabatan: string | null;
    organization: string | null;
    area: string | null;
  };

  // Penerima (bisa multiple)
  penerima: Array<{
    nama: string | null;
    jabatan: string | null;
    organization: string | null;
  }>;

  // Lampiran count
  lampiranCount: number;
  hasAttachment: boolean;

  // Final PDF
  finalPdf: string | null;

  // === ASAL NASKAH (BARU) ===
  /**
   * Sumber/asal naskah untuk user yang sedang login
   * - inbox: User sebagai penerima
   * - sent: User sebagai pengirim
   * - draft: Naskah masih draft
   * - cc: User sebagai tembusan
   */
  source: NaskahSourceEnum;

  /**
   * Label sumber untuk ditampilkan di UI
   * - "Kotak Masuk", "Terkirim", "Draft", "Tembusan"
   */
  sourceLabel: string;

  /**
   * Semua peran user dalam naskah ini
   * Bisa lebih dari satu (misal: pengirim sekaligus tembusan)
   */
  userRoles: Array<'pengirim' | 'penerima' | 'tembusan'>;

  /**
   * Apakah naskah sudah dibaca oleh user
   */
  isRead: boolean;

  /**
   * Apakah naskah di-arsipkan
   */
  isArchived: boolean;

  /**
   * Apakah naskah di-favoritkan
   */
  isFavorite: boolean;

  // Metadata
  createdAt: Date;
}

/**
 * Response DTO untuk Global Search
 */
export class GlobalSearchResponseDto {
  success: boolean;
  message: string;
  data: {
    items: SearchResultItemDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    filters: {
      applied: string[];
      keyword?: string;
    };
  };
}
