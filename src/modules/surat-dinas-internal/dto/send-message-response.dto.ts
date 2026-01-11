// Response DTO untuk send-message SDI
export class SirkulasiInfoDto {
  position: number;
  position_text: string;
  persnum: number | null;
  nama: string | null;
  organization_id: number;
  organization_text: string;
  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;
}

export class SendMessageDataDto {
  id: string;
  jenis: string;
  nomor: string;
  tanggal: string;
  status: string;
  perihal: string;
  pengirim: SirkulasiInfoDto;
  penerima: SirkulasiInfoDto[];
  tembusan: SirkulasiInfoDto[];
  lampiran?: string; // Nama file lampiran dari temporary files
  final_pdf?: string; // Path to final PDF in storage
  
  // Digital signature fields (NEW)
  sign_option?: 'digsig' | 'qr_only' | 'none'; // Opsi TTD yang dipilih
  bsre_name_doc?: string | null; // name_doc dari BSrE untuk verifikasi (krusial!)
  signature_id?: string; // ID tanda tangan internal
  verification_url?: string; // URL untuk verifikasi TTD
}

export class SendMessageResponseDto {
  success: boolean;
  data: SendMessageDataDto;
}

// Error response
export class SendMessageErrorDto {
  success: boolean;
  statusCode: number;
  message: string;
  errors?: string[];
}
