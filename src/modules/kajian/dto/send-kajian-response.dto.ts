/**
 * Response DTO untuk Send Kajian
 * Format mengikuti struktur Nota Dinas
 */

// Info sirkulasi (pengirim/penerima/tembusan)
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
  final_pdf?: string | null;
  final_pdf_url?: string | null;
  lampiran_files?: {
    id: string;
    fileName: string;
    filePath: string;
    fileUrl: string | null;
  }[];
}

export class SendMessageResponseDto {
  success: boolean;
  message?: string;
  data: SendMessageDataDto;
}

// Legacy export untuk backward compatibility
export { SirkulasiInfoDto as KajianSirkulasiInfoDto };
export { SendMessageDataDto as KajianDataDto };
export { SendMessageResponseDto as SendKajianResponseDto };
