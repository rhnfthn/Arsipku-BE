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
import { SifatSurat, SignOption } from './create-surat-dinas-eksternal.dto';
import { SdeSirkulasiInfoDto } from './send-message-response.dto';

/**
 * Enum untuk jenis naskah dinas yang bisa di-forward
 */
export enum JenisNaskahDinas {
  ND = 'ND',
  SDI = 'SDI',
  SDE = 'SDE',
}

/**
 * DTO untuk Forward Surat Dinas Eksternal
 * Sama seperti Forward Nota Dinas, bisa mengubah jenis saat forward
 */
export class ForwardSuratDinasEksternalDto {
  // ID Naskah Referensi (naskah yang diterima dan akan di-forward) (WAJIB)
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
  // LAMPIRAN
  // ============================================================

  @IsOptional()
  @IsBoolean()
  copy_lampiran_from_previous?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lampiran_temp_ids?: string[];

  // ============================================================
  // KOP & KAKI SURAT
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

  // Garis Kewenangan (a.n.)
  @IsOptional()
  @IsString()
  atas_nama?: string;

  @IsOptional()
  @IsNumber()
  atas_nama_position_id?: number;

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
  // KHUSUS SDE: Tujuan Eksternal (WAJIB jika jenis_baru = SDE)
  // ============================================================
  @IsOptional()
  @IsString()
  tujuan?: string; // Nama organisasi eksternal tujuan

  @IsOptional()
  @IsString()
  alamat_tujuan?: string; // Alamat organisasi eksternal
}

/**
 * Response DTO untuk Forward Surat Dinas Eksternal
 */
export class ForwardSuratDinasEksternalResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    jenis: string;
    tanggal: string;
    status: string;
    sifat: string;
    nomor: string;
    perihal: string;
    konten: string;
    pengirim: SdeSirkulasiInfoDto;
    penerima: SdeSirkulasiInfoDto[];
    tembusan?: SdeSirkulasiInfoDto[];
    lampiran?: {
      id: string;
      nama_file: string;
      url: string;
    }[];
    referensi: {
      id_naskah: string;
      jenis: string | null;
      nomor: string | null;
      perihal: string | null;
      tanggal: Date | null;
    };
    final_pdf?: string;
  };
}
