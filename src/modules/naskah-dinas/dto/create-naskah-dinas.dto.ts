import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  ArrayMinSize,
  Matches,
} from 'class-validator';

// Enum untuk sifat surat
export enum SifatSurat {
  SANGAT_RAHASIA = 'sangat_rahasia',
  RAHASIA = 'rahasia',
  TERBATAS = 'terbatas',
  BIASA = 'biasa',
  TERBUKA = 'terbuka',
}

/**
 * DTO untuk send-message Naskah Dinas
 *
 * Field names sesuai dengan form UI:
 * - tanggal_surat: Tanggal Surat
 * - sifat_naskah: Sifat Naskah (biasa/terbuka, dll)
 * - nomor_asal: Nomor Asal Naskah
 * - asal_naskah: Asal Naskah (eksternal.id)
 * - perihal: Perihal
 * - lampiran: Lampiran (text description)
 * - tertuju: Tertuju (array of positionId)
 * - file_attachment: File attachment (PDF)
 */
export class CreateNaskahDinasDto {
  // ============================================
  // TANGGAL
  // ============================================
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}$/, {
    message: 'tanggal_surat must be in format DD.MM.YYYY or YYYY-MM-DD',
  })
  tanggal_surat?: string; // Format: DD.MM.YYYY atau YYYY-MM-DD

  // ============================================
  // SIFAT NASKAH
  // ============================================
  @IsNotEmpty({ message: 'Sifat naskah harus diisi' })
  @IsString()
  sifat_naskah: string; // "Biasa/ Terbuka", "Rahasia", dll

  // ============================================
  // NOMOR ASAL NASKAH
  // ============================================
  @IsOptional()
  @IsString()
  nomor_asal?: string; // Nomor surat dari pihak eksternal → masuk ke naskah.nomor

  // ============================================
  // ASAL NASKAH (PENGIRIM EKSTERNAL)
  // ============================================
  @IsNotEmpty({ message: 'Asal naskah harus diisi' })
  @IsString()
  asal_naskah: string; // eksternal.id (UUID)

  // ============================================
  // PERIHAL
  // ============================================
  @IsNotEmpty({ message: 'Perihal harus diisi' })
  @IsString()
  perihal: string;

  // ============================================
  // LAMPIRAN (TEXT DESCRIPTION)
  // ============================================
  @IsOptional()
  @IsString()
  lampiran?: string; // Deskripsi lampiran (misal: "2 berkas")

  // ============================================
  // TERTUJU (PENERIMA INTERNAL)
  // ============================================
  @IsArray({ message: 'Tertuju harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  tertuju: number[]; // array of positionId dari org_data

  // ============================================
  // OPTIONAL FIELDS
  // ============================================
  @IsNotEmpty({ message: 'Klasifikasi harus diisi' })
  @IsString()
  klasifikasi: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  @IsOptional()
  @IsString()
  konten?: string; // Optional content/body text

  @IsOptional()
  @IsBoolean()
  english?: boolean;

  // ============================================
  // PEMBUAT (Position ID yang create naskah)
  // ============================================
  @IsOptional()
  @IsString()
  created_by_position_id?: string; // Position ID pembuat

  // ============================================
  // VERIFIKATOR (OPSIONAL, BUKAN DIGSIG)
  // ============================================
  @IsOptional()
  @IsArray({ message: 'Verifikator harus berupa array' })
  verifikator?: number[]; // array persnum verifikator, urutan mengikuti pilihan admin

  // ============================================
  // FILE ATTACHMENT (langsung ke final_pdf)
  // ============================================
  // File akan diupload via form-data field 'file_attachment'
  // dan disimpan langsung ke final_pdf
}
