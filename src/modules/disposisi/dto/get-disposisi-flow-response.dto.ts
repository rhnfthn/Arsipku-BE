/**
 * DTO untuk Get Disposisi Flow/Chain Response
 * Menampilkan full chain disposisi dari awal sampai akhir
 */

export interface DisposisiFlowNodeDto {
  // Naskah info
  id: string;
  nomor: string | null;
  tanggal: string | null;
  perihal: string | null;
  sifat: string | null;
  status: string;
  
  // Pengirim info
  pengirim: {
    position_id: string;
    position_text: string;
    organization_text: string;
    nama: string | null;
  } | null;
  
  // Penerima info (bisa multiple)
  penerima: Array<{
    position_id: string;
    position_text: string;
    organization_text: string;
    nama: string | null;
    status_baca: 'terbaca' | 'belum_dibaca';
    read_time: string | null;
  }>;
  
  // Disposisi content
  disposisi: string | null;
  catatan: string | null;
  
  // Lampiran count
  jumlah_lampiran: number;
  
  // PDF
  final_pdf: string | null;
  final_pdf_url: string | null;
  
  // Level in chain (0 = root/awal, 1 = forward pertama, dst)
  level: number;
  
  // Timestamp
  created_at: string;
}

export class GetDisposisiFlowResponseDto {
  success: boolean;
  message: string;
  data: {
    // Root naskah (disposisi awal)
    root: DisposisiFlowNodeDto;
    
    // Full chain dari awal sampai akhir
    chain: DisposisiFlowNodeDto[];
    
    // Metadata
    total_forwards: number; // Berapa kali di-forward
    total_levels: number;   // Total level dalam chain
    
    // Current naskah position in chain
    current_naskah_id: string;
    current_level: number;
  };
}
