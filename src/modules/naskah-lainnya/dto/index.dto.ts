import {
  IsIn, IsString, IsBoolean, IsOptional, IsArray, IsObject, IsNotEmpty, IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class PenandatanganDto {
  @IsString() @IsNotEmpty() nama: string;
  @IsString() @IsNotEmpty() jabatan: string;
  @IsString() @IsOptional() positionId?: string;
  @IsNumber() @IsOptional() persnum?: number;
}

export class ApprovalDto {
  @IsString() @IsOptional() positionId?: string;
  @IsString() @IsNotEmpty() nama: string;
  @IsString() @IsNotEmpty() jabatan: string;
}

export class BuatNaskahDto {
  @IsIn(['PER', 'KEP', 'INS', 'SPD', 'SED', 'SOP', 'KSB', 'PKS', 'KTP', 'PJL', 'LOA', 'SKU', 'BA', 'SKE', 'SPR', 'RRA', 'PUM', 'PIA', 'LAP']) jenis: string;

  @IsString() @IsOptional() nomor?: string; // diisi manual atau dari docx-reader

  @IsString() @IsOptional() klasifikasi?: string;

  // Penandatangan bisa satu object atau array (dukung multiple penandatangan).
  @ValidateNested({ each: true })
  @Type(() => PenandatanganDto)
  penandatangan: PenandatanganDto | PenandatanganDto[];

  @IsIn(['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka']) @IsOptional() sifat?: string;

  @IsIn(['digsig', 'qr_only', 'ttd_basah', 'tanpa_ttd']) @IsOptional() signOption?: string;

  @IsBoolean() butuhLegal: boolean;

  @IsString() @IsOptional() perihal?: string;

  @IsString() @IsOptional() tanggal?: string; // YYYY-MM-DD

  // Rantai approval berjenjang (approver ≠ penandatangan). Opsional — fallback ke default workflow.
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => ApprovalDto)
  approval?: ApprovalDto[];
}

export class UpdateNaskahDto extends PartialType(BuatNaskahDto) {}

export class ApprovalActionDto {
  @IsString() @IsOptional() catatan?: string;
}

export class EvaluasiDto {
  @IsBoolean() sesuai: boolean;
  @IsArray() @IsString({ each: true }) @IsOptional() checklist?: string[];
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

// Pemberi persetujuan legal drafting — drafter legal memilih approver dari unit legal
// (GET /konfigurasi/unit-legal). Urutan array = urutan persetujuan berjenjang.
export class KirimApprovalLegalDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ApprovalDto)
  approval: ApprovalDto[];
}
