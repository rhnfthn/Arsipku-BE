/**
 * DTO untuk Dashboard
 */

// Summary cards (top section) - expanded with more info
export class DashboardSummaryDto {
  // Kotak Masuk
  total_pesan_masuk: number; // Total semua surat masuk
  pesan_baru: number; // Surat masuk yang belum dibaca (unread)

  // Kotak Keluar
  surat_terkirim: number; // Total surat yang sudah dikirim
  draft_tersimpan: number; // Draft yang belum dikirim

  // Disposisi
  disposisi_masuk: number; // Disposisi yang diterima
  disposisi_belum_dibaca: number; // Disposisi yang belum dibaca
  disposisi_high_priority: number; // Disposisi dengan flag priority
  disposisi_belum_tinjut: number; // Disposisi yang sudah dibaca tapi belum ditindaklanjuti

  // Digital Signature
  digsig_menunggu_ttd: number; // Dokumen yang menunggu TTD dari user (status waiting)
  digsig_on_progress: number; // Total dokumen on_progress dimana user adalah salah satu signer

  // Konsep (Draft Approval Workflow)
  konsep_masuk: number; // Konsep yang perlu direview
  konsep_belum_dibaca: number; // Konsep yang belum dibaca

  // Flags & Actions
  surat_favorit: number; // Surat yang ditandai favorit
  surat_arsip: number; // Surat yang diarsipkan
  perlu_tindak_lanjut: number; // Surat yang perlu tindak lanjut
  surat_sudah_ditinjut: number; // Surat yang sudah ditindaklanjuti
}

// Statistik per jenis surat
export class StatistikJenisSuratDto {
  jenis: string; // ND, SDI, SDE, DI, KA, K
  jenis_label: string; // Nota Dinas, Surat Dinas Internal, etc
  jumlah_masuk: number;
  jumlah_keluar: number;
}

// Item untuk Surat Masuk Terbaru
export class SuratMasukTerbaruItemDto {
  id: string;
  id_sirkulasi: string; // ID dari naskah_sirkulasi untuk toggle flag
  jenis: string; // ND, SDI, SDE, DI, KA, K
  pengirim_nama: string | null;
  pengirim_organization: string | null;
  perihal: string | null;
  tanggal: Date | null;
  waktu_relatif: string; // "10:42", "Kemarin", "2 hari lalu"
  sudah_dibaca: boolean;
  flag_favorit: boolean;
  flag_note: boolean;
  flag_arsip: boolean;
  is_priority?: boolean; // Priority flag (hanya untuk jenis='DI')
}

// Item untuk dokumen digsig yang menunggu TTD
export class DigsigMenungguTtdItemDto {
  id: string;
  id_document: string;
  nomor_dokumen: string;
  perihal: string | null;
  jenis_naskah: string;
  tanggal_dokumen: Date | null;
  waktu_relatif: string;
  created_by_name: string | null;
  urutan: number;
  total_signers: number;
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
export class DashboardResponseDto {
  success: boolean;
  message: string;
  data: {
    summary: DashboardSummaryDto;
    surat_masuk_terbaru: SuratMasukTerbaruItemDto[];
    digsig_menunggu_ttd: DigsigMenungguTtdItemDto[];
    statistik_bulanan: StatistikBulananDto[];
    statistik_jenis_surat: StatistikJenisSuratDto[];
  };
}
