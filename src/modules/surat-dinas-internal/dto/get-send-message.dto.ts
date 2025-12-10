// DTO untuk Get Send Message SDI - menampilkan surat yang sudah dikirim oleh user

export class PenerimaInfoDto {
  position: number;
  position_text: string;
  persnum: number;
  nama: string;
  organization_id: number;
  organization_text: string;
  sub_area: number;
  sub_area_text: string;
  area: string;
  area_text: string;
  status: 'dibaca' | 'belum_dibaca';
  readTime: string | null;
}

export class TembusanInfoDto {
  position: number;
  position_text: string;
  persnum: number;
  nama: string;
  organization_id: number;
  organization_text: string;
  sub_area: number;
  sub_area_text: string;
  area: string;
  area_text: string;
}

export class LampiranInfoDto {
  id: string;
  fileName: string;
  filePath: string;
}

export class PengirimInfoDto {
  position: number;
  position_text: string;
  persnum: number;
  nama: string;
  organization_id: number;
  organization_text: string;
  sub_area: number;
  sub_area_text: string;
  area: string;
  area_text: string;
}

export class SendMessageItemDto {
  id: string;                          // ID naskah
  jenis?: string;                      // Jenis surat (SDI)
  nomor: string;                       // Nomor surat
  tanggal: string;                     // Tanggal surat
  perihal: string;                     // Perihal surat
  status: 'draf' | 'final' | 'final_tte';  // Status naskah
  sifat: string;                       // Sifat surat (rahasia, biasa, dll)
  klasifikasi: string;                 // Klasifikasi surat
  klasifikasi_text?: string | null;    // Klasifikasi text
  english?: boolean;                   // English flag

  // Kop Naskah (for draft-list)
  kop_logo?: string | null;
  kop_nama?: string | null;
  alamat_perusahaan?: string | null;

  // Batang tubuh
  konten?: string | null;

  // Kaki
  nama_tempat?: string | null;
  nama_jabatan?: string | null;
  tanda_tangan?: string | null;
  nama_lengkap?: string | null;

  // Sirkulasi
  pengirim?: PengirimInfoDto;
  penerima: PenerimaInfoDto[];         // List penerima dengan status baca
  tembusan?: TembusanInfoDto[];        // List tembusan
  jumlahPenerima: number;              // Total penerima
  jumlahDibaca: number;                // Jumlah yang sudah membaca

  // Lampiran
  lampiran?: string | null;
  lampiran_files?: LampiranInfoDto[];
}

export class GetSendMessageResponseDto {
  success: boolean;
  data: SendMessageItemDto[];
  total: number;
  position: number;
  position_text: string;
  persnum: number;
  nama: string;
}
