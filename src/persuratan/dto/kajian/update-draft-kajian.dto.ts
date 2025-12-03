import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  ValidateNested,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SifatNaskah, LampiranKajianDto } from './create-kajian.dto';

/**
 * DTO untuk Update Draft Kajian
 * 
 * Digunakan untuk mengupdate kajian yang masih berstatus draft
 * Field yang tidak diisi tidak akan diupdate
 */
export class UpdateDraftKajianDto {
  // ID Naskah sekarang dari path parameter (tidak perlu di DTO)
  // @IsNotEmpty({ message: 'ID Naskah harus diisi' })
  // @IsString()
  // id_naskah: string;

  // Pengirim - untuk validasi ownership
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;

  // Penerima - array of position_id (optional untuk update)
  @IsOptional()
  @IsArray({ message: 'Penerima harus berupa array' })
  @IsNumber({}, { each: true, message: 'Setiap penerima harus berupa position_id (number)' })
  penerima_position_ids?: number[];

  // ============================================================
  // FIELD NASKAH UTAMA (optional untuk update)
  // ============================================================

  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal tidak valid' })
  tanggal?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsEnum(SifatNaskah, { message: 'Sifat naskah tidak valid' })
  sifat?: SifatNaskah;

  @IsOptional()
  @IsString()
  nomor?: string;

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranKajianDto)
  lampiran?: LampiranKajianDto[];

  // ============================================================
  // FIELD TAMBAHAN
  // ============================================================

  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_judul?: string;

  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  paraf?: string;

  // ============================================================
  // ACTION: 'simpan' (tetap draft) atau 'kirim' (ubah jadi final)
  // ============================================================
  @IsOptional()
  @IsEnum(['simpan', 'kirim'], { message: 'Action harus "simpan" atau "kirim"' })
  action?: 'simpan' | 'kirim';
}

// Response DTO
export class UpdateDraftKajianResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_naskah: string;
    status: string;
    updated_at: Date;
  };
}
