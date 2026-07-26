// Response DTO untuk send-message disposisi

// Info sirkulasi (pengirim/penerima) - menggunakan data dari position_json
export class DisposisiSirkulasiInfoDto {
  position_id: number;
  position_text: string;
  persnum: number | null;
  nama: string | null;
  organization_id: number;
  organization_text: string;
  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;
  company: number;
  company_name: string | null;
}

export class DisposisiDataDto {
  id: string;
  jenis: string;
  nomor: string | null; // Samakan dengan Nota Dinas (bukan ref_nomor_surat)
  tanggal: string;
  status: string; // 'draf' | 'pending' | 'final'
  sifat: string;
  perihal: string; // Perihal masuk ke tabel naskah
  pengirim: DisposisiSirkulasiInfoDto;
  penerima: DisposisiSirkulasiInfoDto[];
  disposisi?: string; // Petunjuk disposisi dari checkbox (diformat FE)
  catatan?: string; // Catatan untuk checkbox "Lainnya"
  lampiran?: {
    id: string;
    nama_file: string;
    url: string;
    tipe?: string;
  }[];
  id_naskah_sebelumnya?: string | null; // ID naskah disposisi sebelumnya (untuk disposisi lanjutan)
  is_priority?: boolean; // Priority flag untuk disposisi
  final_pdf?: string; // Path to final PDF in storage
}

export class SendDisposisiResponseDto {
  success: boolean;
  message: string;
  data: DisposisiDataDto;
}

// Error response
export class SendDisposisiErrorDto {
  success: boolean;
  statusCode: number;
  message: string;
  errors?: string[];
}
