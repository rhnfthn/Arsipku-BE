import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  ArrayMinSize,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { SifatSurat, SignOption } from './create-nota-dinas.dto';
import { SirkulasiInfoDto } from './send-message-response.dto';

/**
 * Enum untuk jenis naskah dinas yang bisa di-forward
 */
export enum JenisNaskahDinas {
  ND = 'ND',
  SDI = 'SDI',
  SDE = 'SDE',
}

/**
 * DTO untuk Forward Nota Dinas / Surat Dinas
 *
 * Digunakan ketika user yang sudah menerima naskah dinas (ND/SDI/SDE)
 * ingin meneruskan ke user lain.
 *
 * Fitur khusus: Bisa mengubah jenis naskah saat forward
 * - ND → SDI / SDE
 * - SDI → ND / SDE
 * - SDE → ND / SDI
 *
 * Flow:
 * 1. User A kirim ND ke User B
 * 2. User B terima ND, lalu forward sebagai SDI ke User C
 * 3. Sistem buat naskah baru dengan jenis SDI, referensi ke ND asal
 */
export class ForwardNotaDinasDto {
  // ID Naskah referensi (naskah yang diterima) (WAJIB)
  @IsNotEmpty({ message: 'ID Naskah referensi harus diisi' })
  @IsString()
  id_naskah_referensi: string;

  // Pengirim - position_id user yang forward (WAJIB)
  @IsNotEmpty({ message: 'Position ID pengirim harus diisi' })
  @IsNumber({}, { message: 'Position ID pengirim harus berupa number' })
  pengirim: number;

  // Penerima - array of position_id (WAJIB)
  @IsArray({ message: 'Penerima harus berupa array' })
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 penerima' })
  @IsNumber(
    {},
    {
      each: true,
      message: 'Setiap penerima harus berupa position_id (number)',
    },
  )
  penerima: number[];

  // Tembusan (opsional)
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tembusan?: number[];

  // JENIS - bisa mengubah jenis saat forward (WAJIB)
  @IsNotEmpty({ message: 'Jenis naskah harus diisi' })
  @IsEnum(JenisNaskahDinas, { message: 'Jenis naskah tidak valid' })
  jenis: JenisNaskahDinas;

  // Sifat Naskah (WAJIB)
  @IsNotEmpty({ message: 'Sifat naskah harus diisi' })
  @IsEnum(SifatSurat, { message: 'Sifat naskah tidak valid' })
  sifat: SifatSurat;

  // Klasifikasi (WAJIB untuk ND/SDI)
  @IsOptional()
  @IsString()
  klasifikasi?: string;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;

  // Perihal baru (opsional, default dari naskah sebelumnya)
  @IsOptional()
  @IsString()
  perihal?: string;

  // Konten surat (opsional, default dari naskah sebelumnya)
  @IsOptional()
  @IsString()
  konten?: string;

  // ============================================================
  // LAMPIRAN - 2 Opsi:
  // 1. copy_lampiran_from_previous: true (copy dari naskah yang diterima)
  // 2. lampiran_temp_ids: [...] (upload lampiran baru)
  // 3. Kombinasi keduanya
  // ============================================================

  // Copy lampiran dari naskah yang diterima (default: true)
  @IsOptional()
  @IsBoolean()
  copy_lampiran_from_previous?: boolean;

  // Lampiran Temporary IDs (untuk lampiran TAMBAHAN)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

  // ============================================================
  // KOP & KAKI SURAT (opsional, default dari org_data pengirim)
  // ============================================================

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
  tanda_tangan?: string;

  @IsOptional()
  @IsString()
  nama_lengkap?: string;

  @IsOptional()
  @IsBoolean()
  english?: boolean;

  // ============================================================
  // DIGITAL SIGNATURE OPTIONS
  // ============================================================
  @IsOptional()
  @IsEnum(SignOption, { message: 'sign_option tidak valid' })
  sign_option?: SignOption;

  @IsOptional()
  @IsString()
  passphrase?: string;

  // ============================================================
  // KHUSUS SDE: Tujuan Eksternal
  // ============================================================
  @IsOptional()
  @IsString()
  tujuan?: string; // Nama organisasi eksternal tujuan

  @IsOptional()
  @IsString()
  alamat_tujuan?: string; // Alamat organisasi eksternal
}

/**
 * Response DTO untuk Forward Nota Dinas / Surat Dinas
 */
export class ForwardNotaDinasResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string; // ID naskah baru
    jenis: string; // ND/SDI/SDE (bisa beda dari naskah asal)
    tanggal: string;
    status: string;
    sifat: string;
    nomor: string; // Nomor surat yang di-generate otomatis
    perihal: string;
    konten: string;
    pengirim: SirkulasiInfoDto;
    penerima: SirkulasiInfoDto[];
    tembusan?: SirkulasiInfoDto[];
    lampiran?: {
      id: string;
      nama_file: string;
      url: string;
    }[];
    // Referensi ke naskah yang diterima sebelumnya
    referensi: {
      id_naskah: string;
      jenis: string | null; // ND/SDI/SDE (jenis asli sebelum forward)
      nomor: string | null;
      perihal: string | null;
      tanggal: Date | null;
    };
    final_pdf?: string;
  };
}
