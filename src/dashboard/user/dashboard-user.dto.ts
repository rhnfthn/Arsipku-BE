/**
 * DTO untuk Dashboard User
 */

// Summary cards (top section)
export class DashboardSummaryDto {
  total_pesan_masuk: number; // Total semua surat masuk
  pesan_baru: number; // Surat masuk yang belum dibaca
  surat_terkirim: number; // Total surat yang sudah dikirim
  disposisi_masuk: number; // Disposisi yang diterima (untuk non-managerial)
  draft_tersimpan: number; // Draft yang belum dikirim
}

// Item untuk Surat Masuk Terbaru
export class SuratMasukTerbaruItemDto {
  id: string;
  id_sirkulasi: string; // ID dari naskah_sirkulasi untuk toggle flag
  jenis: string; // ND, SDI, SDE, DI, KA
  pengirim_nama: string | null;
  pengirim_organization: string | null;
  perihal: string | null;
  tanggal: Date | null;
  waktu_relatif: string; // "10:42", "Kemarin", "2 hari lalu"
  sudah_dibaca: boolean;
  flag_favorit: boolean;
  flag_note: boolean;
  flag_arsip: boolean;
}

// Statistik bulanan
export class StatistikBulananDto {
  bulan: string; // "Jan", "Feb", dst
  bulan_number: number; // 1-12
  tahun: number;
  surat_masuk: number;
  surat_terkirim: number;
}

// Main response
export class DashboardUserResponseDto {
  success: boolean;
  message: string;
  data: {
    summary: DashboardSummaryDto;
    surat_masuk_terbaru: SuratMasukTerbaruItemDto[];
    statistik: StatistikBulananDto[];
  };
}
