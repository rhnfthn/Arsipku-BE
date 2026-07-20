import { IsOptional, IsString, IsEnum, IsArray, ValidateNested, IsNumber, IsNotEmpty } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LampiranDto } from './create-konsep.dto';

/**
 * DTO untuk review/update konsep oleh pemeriksa
 */
export class ReviewKonsepDto {
  @IsOptional()
  @IsEnum(['approve', 'revisi', 'reject'])
  action?: 'approve' | 'revisi' | 'reject';

  @IsOptional()
  @IsString()
  catatan?: string; // Catatan reviewer

  // ============ UPDATE KONTEN (jika revisi) ============

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

  // ============ FORWARD KE PEMERIKSA LAIN ============

  @IsOptional()
  @IsNumber()
  forward_to_position_id?: number; // Jika approve, forward ke pemeriksa/pengirim lain

  @IsOptional()
  @IsEnum(['pemeriksa', 'pengirim'])
  forward_to_actor?: 'pemeriksa' | 'pengirim';

  // ============ LAMPIRAN ============

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];
}

/**
 * DTO untuk reject konsep
 * Menolak konsep dan mengembalikan ke pengirim sebelumnya
 */
export class RejectKonsepDto {
  @IsNotEmpty()
  @IsNumber()
  from_position_id: number; // Posisi yang reject

  @IsNotEmpty()
  @IsString()
  catatan: string; // Alasan penolakan (wajib)

  @IsOptional()
  @IsNumber()
  return_to_position_id?: number; // Kembalikan ke posisi tertentu (default: pengirim sebelumnya)
}

/**
 * DTO untuk finalisasi konsep oleh pengirim/penandatangan
 * Setelah ini, naskah akan dikirim ke penerima final
 * Body lengkap karena pengirim masih bisa mengubah value
 */
export class FinalizeKonsepDto {
  // ============ WAJIB ============

  @IsNotEmpty()
  @IsNumber()
  from_position_id: number; // Posisi penandatangan (yang finalize)

  // ============ PENERIMA FINAL ============

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  penerima_position_ids?: number[]; // Penerima akhir surat

  // Penerima eksternal (khusus SDE) — array of eksternal.id (UUID string).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  penerima_eksternal?: string[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tembusan_position_ids?: number[]; // Tembusan surat

  // ============ GRUP PENERIMA ============

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); }
      catch { return [value]; }
    }
    return value;
  })
  penerima_grup?: string[]; // Array of grup_penerima UUIDs for penerima

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); }
      catch { return [value]; }
    }
    return value;
  })
  tembusan_grup?: string[]; // Array of grup_penerima UUIDs for tembusan

  // ============ KONTEN NASKAH (bisa diubah) ============

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

  // ============ KOP & TANDA TANGAN ============

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

  // ============ TANDA TANGAN ============

  @IsOptional()
  @IsString()
  tanda_tangan?: string; // URL tanda tangan digital (legacy), jika ada status jadi final_tte

  @IsOptional()
  @IsEnum(['digsig', 'qr_only', 'ttd_basah'])
  sign_option?: 'digsig' | 'qr_only' | 'ttd_basah'; // Opsi TTD: digsig=BSrE, qr_only=QR Code, ttd_basah=TTD manual

  @IsOptional()
  @IsString()
  passphrase?: string; // Passphrase untuk digsig (required if sign_option='digsig')

  // ============ LAMPIRAN ============

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LampiranDto)
  lampiran?: LampiranDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[]; // RECOMMENDED: Array of lampiran IDs dari POST /upload-temporary-konsep

  // ============ CATATAN ============

  @IsOptional()
  @IsString()
  catatan?: string;

  // ============ TAMBAHAN UNTUK SDI/SDE ============

  @IsOptional()
  @IsString()
  kepada_yth?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  // ============ REFERENSI (untuk ND) ============

  @IsOptional()
  @IsString()
  dari?: string;

  @IsOptional()
  @IsString()
  tembusan?: string; // Tembusan text

  // ============ TANGGAL SURAT ============

  @IsOptional()
  @IsString()
  tanggal?: string; // Tanggal surat (default: hari ini)
}
