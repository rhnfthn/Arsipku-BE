import {
  IsString,
  IsArray,
  IsOptional,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNaskahShareDto {
  // Single naskah (backward compat)
  @IsOptional()
  @IsString()
  naskahId?: string;

  // Multi naskah (baru) — jika diisi, share dibuat untuk setiap naskah
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  naskahIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  recipientIds?: string[];

  /**
   * ALL_EMPLOYEES hanya dipakai untuk penyebarluasan Surat Edaran dari halaman
   * selesai. Daftar penerima diselesaikan di server agar browser tidak perlu
   * memuat dan mengirim ribuan position id.
   */
  @IsOptional()
  @IsString()
  @IsIn(['SELECTED', 'ALL_EMPLOYEES'])
  distributionScope?: 'SELECTED' | 'ALL_EMPLOYEES';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  catatan?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SEKALI_LIHAT', 'RENTANG_WAKTU'])
  accessType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;
}
