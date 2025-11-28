// DTO untuk Get Send Message - menampilkan surat yang sudah dikirim oleh user

export class PenerimaInfoDto {
  persnum: number;
  nama: string;
  organizationText: string;
  positionText: string;
  status: 'dibaca' | 'belum_dibaca';
  readTime: string | null;
}

export class SendMessageItemDto {
  id: string;                          // ID naskah
  nomor: string;                       // Nomor surat
  tanggal: string;                     // Tanggal surat
  perihal: string;                     // Perihal surat
  status: 'draf' | 'final' | 'final_tte';  // Status naskah
  sifat: string;                       // Sifat surat (rahasia, biasa, dll)
  klasifikasi: string;                 // Klasifikasi surat
  penerima: PenerimaInfoDto[];         // List penerima dengan status baca
  jumlahPenerima: number;              // Total penerima
  jumlahDibaca: number;                // Jumlah yang sudah membaca
}

export class GetSendMessageResponseDto {
  success: boolean;
  data: SendMessageItemDto[];
  total: number;
  persnum: number;
  nama: string;
}
