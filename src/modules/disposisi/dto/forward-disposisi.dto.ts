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
import { SifatNaskah, LampiranDto } from './create-disposisi.dto';
import { DisposisiSirkulasiInfoDto } from './send-disposisi-response.dto';

/**
 * DTO untuk Forward Disposisi (Disposisi Lanjutan)
 * 
 * Digunakan ketika user yang sudah menerima disposisi ingin
 * meneruskan/mendisposisikan ke bawahannya.
 * 
 * Flow:
 * 1. User A kirim disposisi ke User B (disposisi pertama)
 * 2. User B menerima disposisi, lalu forward ke User C (disposisi lanjutan)
 * 3. Saat forward, ref_nomor otomatis dari naskah yang diterima User B
 */
export class ForwardDisposisiDto {
  // ID Naskah Disposisi yang diterima (WAJIB)
  // Ini adalah id_naskah dari disposisi yang diterima user sebelumnya
  @IsNotEmpty({ message: 'ID Naskah yang diterima harus diisi' })
  @IsString()
  id_naskah_diterima: string;

  // Pengirim - position_id user yang forward (WAJIB)
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;

  // Penerima - array of position_id bawahan (WAJIB)
  @IsArray({ message: 'Penerima harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  @IsNumber({}, { each: true, message: 'Setiap penerima harus berupa position_id (number)' })
  penerima_position_ids: number[];

  // Tanggal Disposisi (WAJIB)
  @IsNotEmpty({ message: 'Tanggal disposisi harus diisi' })
  @IsDateString({}, { message: 'Format tanggal tidak valid' })
  tanggal_disposisi: string;

  // Sifat Naskah (WAJIB)
  @IsNotEmpty({ message: 'Sifat naskah harus diisi' })
  @IsEnum(SifatNaskah, { message: 'Sifat naskah tidak valid' })
  sifat: SifatNaskah;

  // Perihal baru untuk disposisi lanjutan (opsional, default dari naskah sebelumnya)
  @IsOptional()
  @IsString()
  perihal?: string;

  // ============================================================
  // DISPOSISI - Petunjuk Disposisi (checkbox dari frontend)
  // ============================================================
  @IsOptional()
  @IsString()
  disposisi?: string;

  // ============================================================
  // CATATAN - Untuk checkbox "Lainnya"
  // ============================================================
  @IsOptional()
  @IsString()
  catatan?: string;

  // Lampiran (opsional)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];

  // ============================================================
  // Field untuk tabel "di" (konten lengkap lembar disposisi)
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
  nomor_agenda?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal agenda tidak valid' })
  tanggal_agenda?: string;

  @IsOptional()
  @IsString()
  surat_dari?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  paraf?: string;
}

/**
 * Response DTO untuk Forward Disposisi
 */
export class ForwardDisposisiResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string; // ID naskah baru (disposisi lanjutan)
    jenis: string;
    tanggal: string;
    status: string;
    sifat: string;
    nomor: string; // Nomor surat yang di-generate otomatis
    perihal: string;
    pengirim: DisposisiSirkulasiInfoDto;
    penerima: DisposisiSirkulasiInfoDto[];
    disposisi?: string;
    catatan?: string;
    lampiran?: {
      id: string;
      nama_file: string;
      url: string;
      tipe?: string;
    }[];
    // Referensi ke naskah yang diterima sebelumnya
    referensi: {
      id_naskah: string;
      nomor: string | null; // ref_nomor dari naskah sebelumnya
      perihal: string | null;
      tanggal: Date | null;
      jenis: string | null;
    };
  };
}
