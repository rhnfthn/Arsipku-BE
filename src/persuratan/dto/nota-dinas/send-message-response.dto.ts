import { OrgDataPositionDto } from './nota-dinas-recipient-response.dto';

// Response DTO untuk send-message (using org_data structure)
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
