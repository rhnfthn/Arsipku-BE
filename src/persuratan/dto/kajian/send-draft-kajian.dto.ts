import {
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  ValidateNested,
  IsDateString,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SifatNaskah, LampiranKajianDto } from './create-kajian.dto';

/**
 * DTO untuk Send Draft Kajian (mengubah draft menjadi final)
 * 
 * API ini digunakan untuk mengirimkan kajian yang sebelumnya disimpan sebagai draft.
 * Status akan berubah dari 'draf' menjadi 'final'.
 * 
 * Berbeda dengan UpdateDraftKajianDto, field ini tidak memiliki 'action'
 * karena action sudah pasti 'kirim'.
 */
export class SendDraftKajianDto {
  // Pengirim - untuk validasi ownership
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;

  // Penerima - array of position_id (optional - jika ingin update penerima saat kirim)
  @IsOptional()
  @IsArray({ message: 'Penerima harus berupa array' })
  @IsNumber({}, { each: true, message: 'Setiap penerima harus berupa position_id (number)' })
  penerima_position_ids?: number[];

  // ============================================================
  // FIELD NASKAH UTAMA (optional - bisa update saat kirim)
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
}

// Response DTO
export class SendDraftKajianResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_naskah: string;
    status: string; // 'final'
    updated_at: Date;
  };
}
