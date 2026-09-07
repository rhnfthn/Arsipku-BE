import {
  IsIn,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsObject,
  IsNotEmpty,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export const NASKAH_LAINNYA_JENIS = [
  'PER',
  'KEP',
  'INS',
  'SPR',
  'EDR',
  'SOP',
  'MOU',
  'PKS',
  'PROC',
  'PJJ',
  'LOA',
  'SKU',
  'BAC',
  'KET',
  'SPE',
  'RPT',
  'PEN',
  'PGM',
  'LAP',
] as const;

export class PenandatanganDto {
  @IsString() @IsNotEmpty() nama: string;
  @IsString() @IsNotEmpty() jabatan: string;
  @IsString() @IsOptional() positionId?: string;
  @IsNumber() @IsOptional() persnum?: number;
}

export class ApprovalDto {
  @IsString() @IsOptional() positionId?: string;
  @IsNumber() @IsOptional() persnum?: number;
  @IsString() @IsNotEmpty() nama: string;
  @IsString() @IsNotEmpty() jabatan: string;
}

export class SheetDirectorDto {
  @IsNumber() @IsOptional() index?: number;
  @IsString() @IsOptional() positionId?: string;
  @IsNumber() @IsOptional() persnum?: number;
  @IsString() @IsOptional() nama?: string;
  @IsString() @IsOptional() jabatan?: string;
  // Status delegasi direksi: 'ybs' (default, pejabat bersangkungan) / 'PT'/'PH'/'PS'.
  // PT/PH/PS di-prefix di depan nama pengganti di template; nama pengganti diisi
  // lewat field nama. Nantinya pilihan diisi dari get-verifikator.
  @IsString() @IsOptional() delegator?: string;
  // Routing delegasi: persnum pengganti (nama di field nama) — approval task
  // paraf masuk ke pengganti, bukan ke ybs direksi (lihat isApprovalAssignedToUser).
  @IsNumber() @IsOptional() delegatePersnum?: number;
  @IsString() @IsOptional() delegateName?: string;
  @IsIn(['PT', 'PH', 'PS']) @IsOptional() delegatePositionStatus?:
    | 'PT'
    | 'PH'
    | 'PS';
}

export class BuatNaskahDto {
  @IsIn(NASKAH_LAINNYA_JENIS)
  jenis: string;

  @IsString() @IsOptional() nomor?: string; // diisi manual atau dari docx-reader

  @IsString() @IsOptional() klasifikasi?: string;

  // Penandatangan bisa satu object atau array (dukung multiple penandatangan).
  @ValidateNested({ each: true })
  @Type(() => PenandatanganDto)
  penandatangan: PenandatanganDto | PenandatanganDto[];

  @IsIn(['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka'])
  @IsOptional()
  sifat?: string;

  @IsIn(['digsig', 'qr_only', 'ttd_basah', 'tanpa_ttd'])
  @IsOptional()
  signOption?: string;

  @IsBoolean() butuhLegal: boolean;

  @IsString() @IsOptional() perihal?: string;

  @IsString() @IsOptional() tanggal?: string; // YYYY-MM-DD

  // Rantai approval berjenjang. Satu pejabat boleh sekaligus menjadi penandatangan.
  // Opsional — fallback ke default workflow.
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ApprovalDto)
  approval?: ApprovalDto[];
}

export class UpdateNaskahDto extends PartialType(BuatNaskahDto) {}

export class ApprovalActionDto {
  @IsString() @IsOptional() approvalId?: string;
  @IsString() @IsOptional() catatan?: string;
}

export class EvaluasiDto {
  @IsBoolean() sesuai: boolean;
  @IsArray() @IsString({ each: true }) @IsOptional() checklist?: string[];
  @IsString() @IsOptional() catatan?: string;
}

export class KirimEvaluasiDto {
  @ValidateNested()
  @Type(() => ApprovalDto)
  @IsOptional()
  verifikator?: ApprovalDto;

  @IsArray() @IsString({ each: true }) @IsOptional() checklist?: string[];
  @IsString() @IsOptional() catatan?: string;
}

export class KeputusanEvaluasiDto {
  @IsIn(['lanjut_persetujuan', 'legal_drafting_ulang', 'batalkan'])
  keputusan: 'lanjut_persetujuan' | 'legal_drafting_ulang' | 'batalkan';

  @ValidateNested()
  @Type(() => ApprovalDto)
  @IsOptional()
  penerimaPertama?: ApprovalDto;

  @IsString() @IsOptional() catatan?: string;
}

export class TeruskanPersetujuanDto {
  @ValidateNested()
  @Type(() => ApprovalDto)
  penerima: ApprovalDto;

  @IsString() @IsOptional() catatan?: string;
}

export class BlankoDto {
  @IsString() @IsOptional() nomorVerbal?: string;
  @IsString() @IsOptional() tanggal?: string;
  @IsString() @IsOptional() perihal?: string;
  @IsString() @IsOptional() dasarNaskah?: string;
  @IsString() @IsOptional() catatan?: string;
}

export class TandaTanganDto {
  @IsString() @IsOptional() passphrase?: string;
}

export class ManualFinalStatusDto {
  @IsBoolean() final: boolean;
}

export class ManualFinalNomorDto {
  @IsString() nomor: string;
}

/**
 * Metadata penandatangan untuk naskah TTD fisik yang alurnya sudah selesai.
 * Data ini bersifat arsip dan tidak mengubah approval maupun proses fisik.
 */
export class UpdatePenandatanganFisikDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PenandatanganDto)
  penandatangan: PenandatanganDto[];
}

/**
 * Payload lembar persetujuan direksi & blanko verbal — field terstruktur (bukan html).
 * BE membangun template sheet dari field ini (mirip GeneratePdfNodinService).
 * `catatan` dipakai untuk paraf/tolak (transient, per-aksi).
 */
export class SheetDataDto {
  @IsString() @IsOptional() approvalId?: string;
  @IsString() @IsOptional() tanggal?: string; // YYYY-MM-DD
  @IsString() @IsOptional() nomor?: string;
  @IsString() @IsOptional() diusulkanOleh?: string;
  @IsString() @IsOptional() jabatanDiusulkan?: string;
  @IsString() @IsOptional() perihal?: string;
  @IsString() @IsOptional() referensiDari?: string;
  @IsString() @IsOptional() referensiNomor?: string;
  @IsString() @IsOptional() referensiTanggal?: string;
  @IsString() @IsOptional() klasifikasi?: string;
  @IsString() @IsOptional() lampiran?: string;
  @IsString() @IsOptional() legalDrafter?: string;
  @IsString() @IsOptional() legalDrafterJabatan?: string;
  @IsString() @IsOptional() legalChecker?: string;
  @IsString() @IsOptional() legalCheckerJabatan?: string;
  @IsString() @IsOptional() bodyHtml?: string;
  @IsString() @IsOptional() catatan?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SheetDirectorDto)
  ditetapkanOleh?: SheetDirectorDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SheetDirectorDto)
  diketahuiOleh?: SheetDirectorDto[];

  // FE SheetFormModel mengirim alamatInfo (kantor/gedung/kota/alamat dari data
  // org/user). Diterima di sini agar lolos forbidNonWhitelisted, tapi TIDAK
  // diteruskan ke SheetPdfData — BE membangun kop sendiri dari data naskah.
  @IsObject() @IsOptional() alamatInfo?: Record<string, any>;
}

// Pemberi persetujuan legal drafting — drafter legal memilih approver dari unit legal
// (GET /konfigurasi/unit-legal). Urutan array = urutan persetujuan berjenjang.
export class KirimApprovalLegalDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalDto)
  approval: ApprovalDto[];

  // Alasan kirim approval (item #8) → dicatat ke riwayat (transient, per-aksi).
  @IsString() @IsOptional() catatan?: string;

  // Catatan hasil pemeriksaan legal (HTML TinyMCE, item #4) → persist ke naskah.catatan_legal.
  @IsString() @IsOptional() catatan_legal?: string;
}

export class TeruskanLegalDraftingDto {
  @ValidateNested()
  @Type(() => ApprovalDto)
  penerima: ApprovalDto;

  // Wajib pada penerima awal; setelah rantai terbentuk pengesah dibaca dari
  // simpul terakhir rantai legal drafting.
  @ValidateNested()
  @Type(() => ApprovalDto)
  @IsOptional()
  pengesah?: ApprovalDto;

  @IsString() @IsOptional() catatan?: string;
  @IsString() @IsOptional() catatan_legal?: string;
}

export { AssignDelegasiDireksiDto } from './assign-delegasi-direksi.dto';
