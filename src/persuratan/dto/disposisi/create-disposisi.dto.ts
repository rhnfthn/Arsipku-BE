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

  // Ref. Nomor Surat 
  // OPSIONAL: Kosong/"-" untuk disposisi pertama
  // WAJIB: Untuk disposisi lanjutan, otomatis terisi dari nomor naskah disposisi sebelumnya
  @IsOptional()
  @IsString()
  ref_nomor_surat?: string;

  // Ref. Perihal Surat Disposisi (disimpan ke tabel naskah.perihal)
  @IsNotEmpty({ message: 'Perihal harus diisi' })
  @IsString()
  perihal: string;

  // ID Naskah Disposisi Sebelumnya (opsional)
  // Diisi jika ini adalah disposisi lanjutan dari disposisi yang diterima sebelumnya
  // Jika diisi, maka akan otomatis insert ke naskah_referensi
  @IsOptional()
  @IsString()
  id_naskah_sebelumnya?: string;

  // ============================================================
  // DISPOSISI - Petunjuk Disposisi (checkbox dari frontend)
  // Field ini diisi oleh FE dengan format string yang sudah diformat
  // Contoh: "Untuk Diketahui\nProses Lanjut\nKoordinasikan"
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
}

