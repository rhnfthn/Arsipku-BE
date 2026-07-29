import {
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Item atasan untuk multi-select (berjenjang, urutan = index array). */
export class AtasanItemDto {
  @IsInt()
  @Type(() => Number)
  persnum: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  positionId?: number;

  @IsOptional()
  @IsString()
  positionText?: string;
}

/** Item arsip untuk multi-select. */
export class ArsipItemDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  kode?: string;

  @IsOptional()
  @IsDateString()
  tanggalRetensiHabis?: string;
}

/** DTO untuk membuat usulan pemindahan arsip aktif ke inaktif. */
export class CreateTransferDto {
  @IsOptional()
  @IsDateString()
  tanggalUsulan?: string;

  /** Multi-atasan berjenjang (urutan approval = urutan array). */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AtasanItemDto)
  atasanList: AtasanItemDto[];

  /** Multi-arsip. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ArsipItemDto)
  arsipList: ArsipItemDto[];

  @IsOptional()
  @IsString()
  keterangan?: string;

  /** Jika true, langsung kirim ke atasan. */
  @IsOptional()
  submit?: boolean;
}

/** DTO catatan verifikasi. */
export class VerifyTransferDto {
  @IsOptional()
  @IsString()
  verifyNote?: string;
}

/** DTO persetujuan (atasan unit kerja). */
export class ApproveTransferDto {
  @IsOptional()
  @IsString()
  verifyNote?: string;

  @IsOptional()
  needFinalVerification?: boolean;
}

/** DTO penolakan. */
export class RejectTransferDto {
  @IsString()
  rejectedNote: string;
}

/** DTO verifikasi terakhir unit kerja. */
export class FinalVerifyTransferDto {
  @IsOptional()
  @IsString()
  finalVerifyNote?: string;
}

/** DTO verifikasi berkas fisik oleh TU. */
export class VerifyPhysicalFilesDto {
  @IsOptional()
  checklist?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  physicalVerificationNote?: string;

  /** true = sesuai, false = tidak sesuai. */
  sesuai: boolean;
}

/** DTO persetujuan TU. */
export class TuApproveDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/** DTO persetujuan terakhir atasan TU. */
export class FinalApprovalTuDto {
  @IsOptional()
  @IsString()
  note?: string;
}