/**
 * Response DTO untuk Get Send Message Kajian
 * Format mengikuti struktur Nota Dinas
 */

export class PenerimaInfoDto {
  persnum: number;
  nama: string;
  organizationText: string;
  positionText: string;
  status: 'dibaca' | 'belum_dibaca';
  readTime: string | null;
}

export class TembusanInfoDto {
  persnum: number;
  nama: string;
  organizationText: string;
  positionText: string;
}

export class LampiranInfoDto {
  id: string;
  fileName: string;
  filePath: string;
  fileUrl: string | null;
}

export class SendMessageItemDto {
  id: string;
  jenis: string;
  nomor: string;
  tanggal: string;
  status: 'draf' | 'final' | 'final_tte';

  // Kop Naskah
  kop_logo: string | null;
  kop_nama: string | null;
  alamat_perusahaan: string | null;

  // Header
  klasifikasi: string;
  klasifikasi_text: string | null;
  sifat: string;
  perihal: string;
  english: boolean;

  // Batang Tubuh
  konten: string | null;

  // Kaki
  nama_tempat: string | null;
  nama_jabatan: string | null;
  tanda_tangan: string | null;
  nama_lengkap: string | null;

  // Sirkulasi
  pengirim: {
    persnum: number;
    nama: string;
    positionText: string;
    organizationText: string;
  };
  penerima: PenerimaInfoDto[];
  tembusan: TembusanInfoDto[];

  // Lampiran
  lampiran: string | null;
  lampiran_files: LampiranInfoDto[];

  // Final PDF
  final_pdf: string | null;
  final_pdf_url: string | null;

  // Summary
  jumlahPenerima: number;
  jumlahDibaca: number;
}

export class GetSendMessageResponseDto {
  success: boolean;
  data: SendMessageItemDto[];
  total: number;
  positionId: number;
  positionText: string;
  nama: string;
}

// Legacy export untuk backward compatibility
export { SendMessageItemDto as SentKajianItemDto };
export { GetSendMessageResponseDto as GetSendKajianResponseDto };
