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

  // Ref. Nomor Surat (opsional)
  @IsOptional()
  @IsString()
  ref_nomor_surat?: string;

  // Perihal (masuk ke tabel naskah)
  @IsOptional()
  @IsString()
  perihal?: string;

  // ID Naskah Disposisi Sebelumnya (opsional)
  // Diisi jika ini adalah disposisi lanjutan dari disposisi yang diterima sebelumnya
  @IsOptional()
  @IsString()
  id_naskah_sebelumnya?: string;

  // ============================================================
  // DISPOSISI - Petunjuk Disposisi (checkbox dari frontend)
  // Field ini diisi oleh FE dengan format string yang sudah diformat
  // Disimpan ke kolom "disposisi" di tabel "di"
  // ============================================================
  @IsOptional()
  @IsString()
  disposisi?: string;

  // ============================================================
  // CATATAN - Untuk checkbox "Lainnya"
  // Jika user klik checkbox "Lainnya", isi catatan masuk ke sini
  // Disimpan ke kolom "catatan" di tabel "di"
  // ============================================================
  @IsOptional()
  @IsString()
  catatan?: string;

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

  // Paraf
  @IsOptional()
  @IsString()
  paraf?: string;

  // Priority Flag
  @IsOptional()
  is_priority?: boolean;

  // Lampiran Temp IDs
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];
}

/**
 * Response DTO untuk send draft disposisi
 */
export class SendDraftDisposisiResponseDto {
  success: boolean;
  message: string;
  data?: {
    id: string;
    jenis: string;
    nomor: string;
    tanggal: string;
    status: 'final';
    sifat: string;
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
    id_naskah_sebelumnya?: string | null;
  };
}
