import { IsOptional, IsString, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

/** DTO untuk membuat usulan pemindahan arsip inaktif. */
export class CreateTransferDto {
  @IsOptional()
  @IsDateString()
  tanggalUsulan?: string;

  @IsInt()
  @Type(() => Number)
  atasanPersnum: number;

  @IsOptional()
  @IsString()
  atasanName?: string;

  @IsOptional()
  @Type(() => Number)
  atasanPositionId?: number;

  @IsString()
  arsipId: string;

  @IsOptional()
  @IsString()
  arsipPerihal?: string;

  @IsOptional()
  @IsString()
  arsipKode?: string;

  @IsOptional()
  @IsDateString()
  tanggalRetensiAktifHabis?: string;

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
