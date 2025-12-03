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

// Enum untuk sifat naskah
export enum SifatNaskah {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

// Enum untuk petunjuk disposisi (15 checkbox)
export enum PetunjukDisposisiEnum {
  UNTUK_DIKETAHUI = 'untuk_diketahui',
  PROSES_LANJUT = 'proses_lanjut',
  KOORDINASIKAN = 'koordinasikan',
  CEK = 'cek',
  MONITOR = 'monitor',
  EVALUASI = 'evaluasi',
  DIKAJI_KEMUNGKINANNYA = 'dikaji_kemungkinannya',
  LAPORKAN = 'laporkan',
  UNTUK_MENJADI_PERHATIAN = 'untuk_menjadi_perhatian',
  UNTUK_DIJADIKAN_ACUAN = 'untuk_dijadikan_acuan',
  HARAP_MEWAKILI = 'harap_mewakili',
  HARAP_MENDAMPINGI = 'harap_mendampingi',
  TUNJUK_PERWAKILAN = 'tunjuk_perwakilan',
  SIAPKAN_BAHAN_MATERI = 'siapkan_bahan_materi',
  LAINNYA = 'lainnya',
}

// DTO untuk lampiran (jika ada file)
export class LampiranDto {
  @IsNotEmpty({ message: 'Nama file harus diisi' })
  @IsString()
  nama_file: string;

  @IsNotEmpty({ message: 'URL file harus diisi' })
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  tipe?: string; // pdf/doc/img
}

// DTO untuk petunjuk disposisi yang dipilih
export class PetunjukDisposisiDto {
  @IsNotEmpty({ message: 'Kode petunjuk disposisi harus diisi' })
  @IsEnum(PetunjukDisposisiEnum, { message: 'Kode petunjuk disposisi tidak valid' })
  kode: PetunjukDisposisiEnum;

  @IsOptional()
  @IsString()
  catatan?: string; // Untuk item "Lainnya" atau catatan tambahan
}

// Main DTO untuk send-message disposisi
export class CreateDisposisiDto {
  // Pengirim - menggunakan position_id
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim_position_id: number;

  // Penerima - array of position_id
  @IsArray({ message: 'Penerima harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  @IsNumber({}, { each: true, message: 'Setiap penerima harus berupa position_id (number)' })
  penerima_position_ids: number[];

  // Tanggal Disposisi
  @IsNotEmpty({ message: 'Tanggal disposisi harus diisi' })
  @IsDateString({}, { message: 'Format tanggal tidak valid' })
  tanggal_disposisi: string;

  // Sifat Naskah / Biasa / Terbuka
  @IsNotEmpty({ message: 'Sifat naskah harus diisi' })
  @IsEnum(SifatNaskah, { message: 'Sifat naskah tidak valid' })
  sifat: SifatNaskah;

  // Ref. Nomor Surat (disimpan ke tabel naskah_referensi)
  @IsNotEmpty({ message: 'Ref. Nomor Surat harus diisi' })
  @IsString()
  ref_nomor_surat: string;

  // Ref. Perihal Surat Disposisi
  @IsNotEmpty({ message: 'Ref. Perihal Surat harus diisi' })
  @IsString()
  ref_perihal_surat: string;

  // Petunjuk Disposisi - array of selected checkboxes (disimpan ke kolom konten)
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

