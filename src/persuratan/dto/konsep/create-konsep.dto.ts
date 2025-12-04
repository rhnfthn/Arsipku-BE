import { IsNotEmpty, IsOptional, IsString, IsEnum, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO untuk lampiran
 */
export class LampiranDto {
  @IsNotEmpty()
  @IsString()
  nama_file: string;

  @IsNotEmpty()
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  tipe?: string;
}

/**
 * DTO untuk membuat konsep baru
 * 
 * Konsep dibuat oleh bawahan untuk dikirim ke atasan
 * Atasan bisa forward ke atasannya lagi (mirip disposisi tapi arah ke atas)
 */
export class CreateKonsepDto {
  // ============ WAJIB ============
  
  @IsNotEmpty()
  @IsEnum(['ND', 'SDI', 'SDE'])
  jenis: 'ND' | 'SDI' | 'SDE';

  @IsNotEmpty()
  @IsNumber()
  from_position_id: number; // Pembuat konsep (yang kirim)

  @IsNotEmpty()
  @IsNumber()
  to_position_id: number; // Penerima konsep (atasan)

  // ============ KONTEN NASKAH ============

  @IsOptional()
  @IsString()
  perihal?: string;

  @IsOptional()
  @IsString()
  konten?: string;

  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsEnum(['sangat_rahasia', 'rahasia', 'terbatas', 'biasa', 'terbuka'])
  sifat?: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'biasa' | 'terbuka';

  // ============ KOP & TANDA TANGAN (untuk ND/SDI/SDE) ============

  @IsOptional()
  @IsString()
  kop_logo?: string;

  @IsOptional()
  @IsString()
  kop_nama?: string;

  @IsOptional()
  @IsString()
  alamat_perusahaan?: string;

  @IsOptional()
  @IsString()
  nama_tempat?: string;

  @IsOptional()
  @IsString()
  nama_jabatan?: string;

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  // ============ LAMPIRAN ============

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];

  // ============ CATATAN KONSEP ============

  @IsOptional()
  @IsString()
  catatan?: string; // Catatan dari konseptor ke pemeriksa

  // ============ TAMBAHAN UNTUK SDI/SDE ============

  @IsOptional()
  @IsString()
  kepada_yth?: string; // Untuk SDI/SDE

  @IsOptional()
  @IsString()
  alamat?: string; // Untuk SDE

  // ============ REFERENSI (untuk ND) ============

  @IsOptional()
  @IsString()
  dari?: string; // Dari siapa (untuk ND)

  @IsOptional()
  @IsString()
  tembusan?: string; // Tembusan text (untuk ND/SDI/SDE)

  // ============ TANGGAL ============

  @IsOptional()
  @IsString()
  tgl?: string; // Format YYYY-MM-DD, default hari ini

  // ============ TANDA TANGAN ============

  @IsOptional()
  @IsString()
  tanda_tangan?: string; // URL/path tanda tangan, jika ada maka status jadi 'final_tte'
}
