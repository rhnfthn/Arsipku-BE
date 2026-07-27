import { IsString, IsArray, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO untuk Generate PDF Disposisi
 * Menerima data dari frontend dan generate PDF dinamis
 *
 * Field dari UI Form Disposisi:
 * - Tanggal Disposisi
 * - Sifat Naskah (Biasa, Terbatas, Rahasia, Sangat Rahasia)
 * - Ref. Nomor Surat
 * - Ref. Perihal Surat Disposisi
 * - Tertuju (penerima)
 * - Disposisi (checkbox options)
 * - Lampiran Berkas
 */
export class GeneratePdfDisposisiDto {
  /**
   * HTML content untuk bagian Catatan dari rich text editor
   * Bisa dalam bentuk plain text HTML atau base64 encoded
   * Optional - bisa null/kosong jika tidak ada catatan
   */
  @IsString()
  @IsOptional()
  htmlContent?: string;

  /**
   * Pengirim disposisi (nama atau position text)
   * Akan ditampilkan di header "LEMBAR DISPOSISI [pengirim]"
   */
  @IsString()
  @IsOptional()
  pengirim?: string;

  /**
   * Penerima Disposisi (Tertuju/Kepada Yth)
   * Array dari nama-nama penerima
   * Bisa dikirim sebagai JSON string atau langsung array
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return [value];
  })
  tertuju?: string[];

  /**
   * Tanggal Disposisi
   * Format: DD/MM/YYYY atau YYYY-MM-DD atau format tanggal lainnya
   */
  @IsString()
  @IsOptional()
  tanggal_disposisi?: string;

  /**
   * Sifat/Klasifikasi Naskah
   * Pilihan: Biasa, Terbatas, Rahasia, Sangat Rahasia
   */
  @IsString()
  @IsOptional()
  sifat?: string;

  /**
   * Referensi Nomor Surat asal yang didisposisi
   * Contoh: "001/ND/XII/2024"
   */
  @IsString()
  @IsOptional()
  @Transform(({ value, obj }) => value || obj['ref.nomor'])
  ref_nomor?: string;

  /**
   * Referensi Perihal Surat asal yang didisposisi
   */
  @IsString()
  @IsOptional()
  @Transform(({ value, obj }) => value || obj['ref.perihal'])
  ref_perihal?: string;

  /**
   * Referensi Tanggal Surat asal yang didisposisi
   * Format: YYYY-MM-DD atau DD/MM/YYYY
   */
  @IsString()
  @IsOptional()
  @Transform(({ value, obj }) => value || obj['ref.tanggal'])
  ref_tanggal?: string;

  /**
   * Referensi Pengirim Surat asal yang didisposisi (Surat dari)
   */
  @IsString()
  @IsOptional()
  @Transform(({ value, obj }) => value || obj['ref.pengirim'])
  ref_pengirim?: string;

  /**
   * Pilihan Disposisi yang dicentang
   * Array dari opsi yang dipilih, contoh: ["Untuk Diketahui", "Proses Lanjut"]
   *
   * Opsi yang tersedia:
   * - Untuk Diketahui, Proses Lanjut, Koordinasikan
   * - Cek, Monitor, Evaluasi
   * - Dikaji Kemungkinannya, Laporkan, Untuk Menjadi Perhatian
   * - Untuk Dijadikan Acuan/Dipergunakan, Harap Mewakili, Harap Mendampingi
   * - Tunjuk Perwakilan, Siapkan Bahan/Materi, Lainnya
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return [value];
  })
  disposisi?: string[];

  /**
   * ID lampiran temporary yang sudah diupload
   * Akan di-merge ke PDF utama
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return [value];
  })
  lampiran_temp_ids?: string[];

  /**
   * Tembusan (CC) jika ada
   * Array nama-nama tembusan
   */
  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return [value];
  })
  tembusan?: string[];

  /**
   * Flag untuk final PDF (kirim) atau preview/draft
   * Jika true, akan generate nomor surat
   */
  @IsString()
  @IsOptional()
  final_pdf?: string;

  /**
   * Catatan tambahan untuk disposisi "Lainnya"
   * Muncul ketika checkbox "Lainnya" dicentang
   * Berisi teks catatan/instruksi khusus dari pengirim
   */
  @IsString()
  @IsOptional()
  catatan?: string;
}
