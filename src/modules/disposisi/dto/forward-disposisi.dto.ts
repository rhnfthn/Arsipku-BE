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
  // Actor delegasi context — di-set controller dari @CurrentUser (Spec B-2b).
  @IsOptional()
  @IsString()
  actor_position_status?: string | null;

  @IsOptional()
  @IsString()
  actor_nama?: string;

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
  @IsNumber(
    {},
    {
      each: true,
      message: 'Setiap penerima harus berupa position_id (number)',
    },
  )
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

  // Ref. Nomor Surat (opsional)
  // Digunakan untuk field "Nomor" di kotak tengah PDF
  @IsOptional()
  @IsString()
  ref_nomor_surat?: string;

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

  // ============================================================
  // LAMPIRAN - 3 Opsi yang bisa dikombinasikan:
  // 1. copy_lampiran_from_previous: true (copy dari naskah yang diterima)
  // 2. lampiran_temp_ids: [...] (upload lampiran baru)
  // 3. Kombinasi keduanya
  // ============================================================

  // Copy lampiran dari naskah yang diterima (default: true)
  // Jika true, akan copy semua lampiran dari naskah_diterima
  @IsOptional()
  copy_lampiran_from_previous?: boolean;

  // Lampiran Temporary IDs (untuk lampiran TAMBAHAN yang baru diupload)
  // Array of lampiran IDs yang sudah diupload via /DI/upload-temporary-lampiran
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

  // Lampiran (opsional) - Legacy direct upload (deprecated)
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

  // Priority Flag
  @IsOptional()
  is_priority?: boolean;
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
    is_priority?: boolean;
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
    final_pdf?: string; // Path to generated PDF file in storage
  };
}
