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
  tanggal: string;
  status: string; // 'draf' atau 'final'
  sifat: string;
  ref_nomor_surat: string;
  ref_perihal_surat: string;
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

