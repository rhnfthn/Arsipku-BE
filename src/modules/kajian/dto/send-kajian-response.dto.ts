/**
 * Response DTO untuk Send Kajian
 */

// Info sirkulasi (pengirim/penerima/tembusan)
export class KajianSirkulasiInfoDto {
  position_id: number;
  position_text: string | null;
  persnum: number | null;
  nama: string | null;
  organization_id: number;
  organization_text: string | null;
  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;
  company: number;
  company_name: string | null;
}

// Info lampiran
export class KajianLampiranInfoDto {
  id: string;
  nama_file: string;
  url: string;
  tipe?: string;
}

// Data detail kajian dalam response
export class KajianDataDto {
  id: string;
  jenis: string; // 'KA'
  tanggal: string;
  status: string; // 'draf' | 'final' | 'final_tte'
  sifat: string;
  klasifikasi?: string | null;
  klasifikasi_text?: string | null;
  nomor?: string | null;
  perihal: string;
  konten?: string | null;
  pengirim: KajianSirkulasiInfoDto;
  penerima: KajianSirkulasiInfoDto[];
  lampiran?: KajianLampiranInfoDto[];
}

// Main response untuk send-message & save-draft
export class SendKajianResponseDto {
  success: boolean;
  message: string;
  data: KajianDataDto;
}
