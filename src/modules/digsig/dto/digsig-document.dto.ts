import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  MaxLength,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ======== Signer DTO ========
export class SignerDto {
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  persnum: number;

  @IsString()
  @IsOptional()
  nama?: string;

  @IsString()
  @IsOptional()
  jabatan?: string;

  @IsString()
  @IsOptional()
  lokasi?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  positionId?: number;
}

// ======== Create Document DTO ========
export class CreateDigsigDocumentDto {
  @IsDateString()
  @IsNotEmpty({ message: 'Tanggal dokumen wajib diisi' })
  tanggalDokumen: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  klasifikasi?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  klasifikasiText?: string;

  @IsString()
  @IsNotEmpty({ message: 'Jenis naskah wajib diisi' })
  @MaxLength(50)
  jenisNaskah: string; // ND, SDI, SDE, DI, KA, PGM, etc

  @IsString()
  @IsNotEmpty({ message: 'Nomor dokumen wajib diisi' })
  @MaxLength(150)
  nomorDokumen: string;

  @IsString()
  @IsOptional()
  perihal?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  visibleSign?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '') return undefined;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        // Accept array of numbers (persnum only) or objects
        if (Array.isArray(parsed)) {
          return parsed.map((item) => {
            // If it's a number, return as is
            if (typeof item === 'number') {
              return item;
            }
            // If it's already an object, keep as is (backward compatibility)
            return item;
          });
        }
        return undefined;
      } catch (e) {
        return undefined;
      }
    }
    return Array.isArray(value) ? value : undefined;
  })
  signers?: Array<
    | number
    | {
        persnum: number;
        nama?: string;
        jabatan?: string;
        lokasi?: string;
        positionId?: number;
      }
  >;

  // File akan dihandle terpisah via multipart
  // filePath, fileName, fileSize, fileMimeType akan diisi dari file upload
}

// ======== Update Document DTO ========
export class UpdateDigsigDocumentDto {
  @IsString()
  @IsOptional()
  id_document?: string;

  @IsDateString()
  @IsOptional()
  tanggalDokumen?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  klasifikasi?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  klasifikasiText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  jenisNaskah?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  nomorDokumen?: string;

  @IsString()
  @IsOptional()
  perihal?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  visibleSign?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '') return undefined;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        // Accept array of numbers (persnum only) or objects
        if (Array.isArray(parsed)) {
          return parsed.map((item) => {
            // If it's a number, return as is
            if (typeof item === 'number') {
              return item;
            }
            // If it's already an object, keep as is (backward compatibility)
            return item;
          });
        }
        return undefined;
      } catch (e) {
        return undefined;
      }
    }
    return Array.isArray(value) ? value : undefined;
  })
  signers?: Array<
    | number
    | {
        persnum: number;
        nama?: string;
        jabatan?: string;
        lokasi?: string;
        positionId?: number;
      }
  >;
}

// ======== Filter/Query DTO ========
export class FilterDigsigDocumentDto {
  @IsOptional()
  @IsEnum(['on_progress', 'completed', 'rejected', 'cancelled'])
  status?: 'on_progress' | 'completed' | 'rejected' | 'cancelled';

  @IsOptional()
  @IsString()
  jenisNaskah?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  createdBy?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  signerPersnum?: number; // Filter dokumen yang perlu di-TTD oleh user ini

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // Search di nomor, perihal

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
export class SignDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'Passphrase wajib diisi' })
  passphrase: string;

  @IsString()
  @IsOptional()
  keterangan?: string;
}

// ======== Reject Document DTO ========
export class RejectDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'Alasan reject wajib diisi' })
  keterangan: string;
}

// ======== Response DTOs ========
export class SignerResponseDto {
  id: string;
  urutan: number;
  persnum: number;
  nik: string | null;
  nama: string | null;
  jabatan: string | null;
  positionId: number | null;
  status: 'pending' | 'waiting' | 'signed' | 'rejected';
  signedAt: Date | null;
  keterangan: string | null;
}

export class DigsigDocumentResponseDto {
  id: string;
  tanggalDokumen: Date;
  klasifikasi: string | null;
  klasifikasiText: string | null;
  jenisNaskah: string;
  nomorDokumen: string;
  perihal: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  filePreviewUrl?: string | null;
  signedFilePath: string | null;
  signedFilePreviewUrl?: string | null;
  visibleSign: boolean;
  status: string;
  currentSignerOrder: number;
  totalSigners: number;
  createdBy: number;
  createdByName: string | null;
  createdByPosition: string | null;
  createdAt: Date;
  updatedAt: Date;
  signers: SignerResponseDto[];
}

export class DigsigDocumentPaginatedResponseDto {
  data: DigsigDocumentResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ======== Jenis Naskah Options ========
export const JENIS_NASKAH_OPTIONS = [
  { value: 'ND', label: 'Nota Dinas' },
  { value: 'SDI', label: 'Surat Dinas Internal' },
  { value: 'SDE', label: 'Surat Dinas Eksternal' },
  { value: 'DI', label: 'Disposisi' },
  { value: 'KA', label: 'Kajian' },
  { value: 'PGM', label: 'Piagam/Sertifikat' },
  { value: 'SK', label: 'Surat Keputusan' },
  { value: 'PKS', label: 'Perjanjian Kerja Sama' },
  { value: 'BA', label: 'Berita Acara' },
  { value: 'SPT', label: 'Surat Perintah Tugas' },
  { value: 'LAINNYA', label: 'Lainnya' },
];
