/**
 * Response DTO untuk Get Send Message Kajian
 * Mendapatkan daftar kajian yang sudah dikirimkan oleh user
 */

// Item per pesan yang dikirim
export class SentKajianItemDto {
  id: string;
  jenis: string; // 'KA'
  nomor: string | null;
  perihal: string | null;
  tanggal: Date | null;
  sifat: string | null;
  status: string; // 'draf' | 'final' | 'final_tte'
  pengirim: {
    position_id: string;
    position_text: string;
    organization_text: string;
    nama: string | null;
  };
  penerima: Array<{
    position_id: string;
    position_text: string;
    organization_text: string;
    nama: string | null;
    status_baca: 'terbaca' | 'belum_dibaca';
    read_time: Date | null;
  }>;
  jumlah_lampiran: number;
}

// Main response
export class GetSendKajianResponseDto {
  success: boolean;
  message: string;
  total: number;
  data: SentKajianItemDto[];
}
