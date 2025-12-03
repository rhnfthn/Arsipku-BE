import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  ArrayMinSize,
  ValidateNested,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SifatNaskah,
  PetunjukDisposisiDto,
  LampiranDto,
} from './create-disposisi.dto';

/**
 * DTO untuk mengirim draft disposisi (mengubah status dari draf ke final)
 * Sama seperti UpdateDraftDisposisiDto, tapi tanpa id_naskah (dari path param)
 * dan tanpa action (otomatis 'kirim')
 */
export class SendDraftDisposisiDto {
  // Pengirim - menggunakan position_id (untuk validasi ownership)
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;

  // Penerima - array of position_id
  @IsOptional()
  @IsArray({ message: 'Penerima harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  @IsNumber({}, { each: true, message: 'Setiap penerima harus berupa position_id (number)' })
  penerima_position_ids?: number[];

  // Tanggal Disposisi
  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal tidak valid' })
  tanggal_disposisi?: string;

  // Sifat Naskah / Biasa / Terbuka
  @IsOptional()
  @IsEnum(SifatNaskah, { message: 'Sifat naskah tidak valid' })
  sifat?: SifatNaskah;

  // Ref. Nomor Surat
  @IsOptional()
  @IsString()
  ref_nomor_surat?: string;

  // Ref. Perihal Surat Disposisi
  @IsOptional()
  @IsString()
  ref_perihal_surat?: string;

  // Petunjuk Disposisi - array of selected checkboxes
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PetunjukDisposisiDto)
  petunjuk_disposisi?: PetunjukDisposisiDto[];

  // Lampiran
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];

  // ============================================================
  // Field untuk tabel "di" (konten lengkap lembar disposisi)
  // ============================================================

  // Kop Naskah
  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_judul?: string;

  // Penandatangan
  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  // Nomor Agenda
  @IsOptional()
  @IsString()
  nomor_agenda?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal agenda tidak valid' })
  tanggal_agenda?: string;

  // Referensi Surat (surat_dari = pengirim surat asli yang didisposisi)
  @IsOptional()
  @IsString()
  surat_dari?: string;

  // Klasifikasi surat
  @IsOptional()
  @IsString()
  klasifikasi?: string;

  // Catatan disposisi (selain petunjuk checkbox)
  @IsOptional()
  @IsString()
  catatan?: string;

  // Paraf
  @IsOptional()
  @IsString()
  paraf?: string;
}

/**
 * Response DTO untuk send draft disposisi
 */
export class SendDraftDisposisiResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_naskah: string;
    status: 'final';
    updated_at: Date;
  };
}
