import { IsOptional, IsString, IsBoolean } from 'class-validator';

/** DTO untuk verifikasi usulan oleh atasan managerial. */
export class VerifyUsulanDto {
  @IsOptional()
  @IsString()
  verifyNote?: string;
}

/** DTO untuk persetujuan usulan oleh atasan managerial. */
export class ApproveUsulanDto {
  @IsOptional()
  @IsString()
  verifyNote?: string;

  @IsOptional()
  @IsBoolean()
  needFinalVerification?: boolean;
}

/** DTO untuk penolakan usulan oleh atasan managerial. */
export class RejectUsulanDto {
  @IsString()
  rejectedNote: string;
}

/** DTO untuk verifikasi terakhir (EVP Corporate Secretary / atasan managerial). */
export class FinalVerifyUsulanDto {
  @IsOptional()
  @IsString()
  finalVerifyNote?: string;
}

/** DTO untuk checklist berkas fisik. */
export class PreparePhysicalDto {
  @IsOptional()
  checklist?: Record<string, boolean>;
}
