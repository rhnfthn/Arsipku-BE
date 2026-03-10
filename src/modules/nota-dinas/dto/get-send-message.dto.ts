// DTO untuk Get Send Message - menampilkan surat yang sudah dikirim oleh user

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
}

export class SendMessageItemDto {
  id: string;                          // ID naskah
  jenis: string;                       // Jenis naskah (ND)
  nomor: string;                       // Nomor surat
  tanggal: string;                     // Tanggal surat
  status: 'draf' | 'pending' | 'final' | 'final_tte';  // Status naskah
  
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
  lampiran: string | null;              // Keterangan lampiran
  lampiran_files: LampiranInfoDto[];    // List file lampiran

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
