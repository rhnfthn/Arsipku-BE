import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ======== Filter DTO untuk halaman Penandatanganan ========
export class FilterPenandatangananDto {
  @IsOptional()
  @IsEnum(['all', 'pending', 'signed', 'rejected'])
  status?: 'all' | 'pending' | 'signed' | 'rejected';

  @IsOptional()
  @IsString()
  jenisNaskah?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // Search di nomor dokumen, perihal

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  limit?: number;
}

// ======== Sign Document DTO ========
export class SignWithPassphraseDto {
  @IsString()
  @IsNotEmpty({ message: 'Passphrase wajib diisi' })
  passphrase: string;

  @IsString()
  @IsOptional()
  keterangan?: string;
}

// ======== Reject Document DTO ========
export class RejectSigningDto {
  @IsString()
  @IsNotEmpty({ message: 'Alasan penolakan wajib diisi' })
  alasan: string;
}

// ======== Response DTOs ========
export interface SignerInfoDto {
  id: string;
  urutan: number;
  persnum: number;
  nama: string | null;
  jabatan: string | null;
  lokasi: string | null;
  status: 'pending' | 'waiting' | 'signed' | 'rejected';
  signedAt: Date | null;
}

export interface PenandatangananItemDto {
  id: string;
  tanggalDibuat: Date;
  nomorDokumen: string;
  jenisNaskah: string;
  perihal: string | null;
  totalPenandatangan: number;
  currentSignerOrder: number;
  status: 'pending' | 'signed' | 'rejected';
  mySignerStatus: 'pending' | 'waiting' | 'signed' | 'rejected';
  documentStatus: 'on_progress' | 'completed' | 'rejected' | 'cancelled';
  canSign: boolean;
  canReject: boolean;
  signers: SignerInfoDto[];
  filePreviewUrl: string | null;
  signedFilePreviewUrl: string | null;
  createdByName: string | null;
  createdByPosition: string | null;
}

export interface PenandatangananPaginatedResponseDto {
  data: PenandatangananItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalPending: number;
    totalSigned: number;
    totalRejected: number;
  };
}

export interface SigningResultDto {
  success: boolean;
  message: string;
  documentId: string;
  signedAt: Date;
  signatureId?: string;
  bsreDocId?: string;
  signedFilePath?: string;
  signedFilePreviewUrl?: string;
}

export interface RejectResultDto {
  success: boolean;
  message: string;
  documentId: string;
  rejectedAt: Date;
}

export interface PenandatangananDetailDto {
  id: string;
  tanggalDokumen: Date;
  tanggalDibuat: Date;
  nomorDokumen: string;
  jenisNaskah: string;
  jenisNaskahText: string;
  klasifikasi: string | null;
  klasifikasiText: string | null;
  perihal: string | null;
  
  // File info
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  filePreviewUrl: string | null;
  signedFileName: string | null;
  signedFilePreviewUrl: string | null;
  
  // Status
  documentStatus: 'on_progress' | 'completed' | 'rejected' | 'cancelled';
  currentSignerOrder: number;
  totalSigners: number;
  
  // Signers
  signers: SignerInfoDto[];
  
  // My signing status
  mySignerInfo: SignerInfoDto | null;
  canSign: boolean;
  canReject: boolean;
  
  // Creator info
  createdBy: number;
  createdByName: string | null;
  createdByPosition: string | null;
}
