import { EksternalRecipientDto, SdeOrgDataPositionDto } from './sde-recipient-response.dto';

/**
 * Info pengirim dari org_data
 */
export class SdeSirkulasiInfoDto {
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

/**
 * Info penerima eksternal
 */
export class SdePenerimaInfoDto {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  kontak: string;
}

/**
 * Data response untuk send-message SDE
 */
export class SdeSendMessageDataDto {
  id: string;
  jenis: string;
  nomor: string;
  tanggal: string;
  status: string;
  perihal: string;
  pengirim: SdeSirkulasiInfoDto;
  penerima: SdePenerimaInfoDto[];
}

/**
 * Response DTO untuk send-message SDE
 */
export class SdeSendMessageResponseDto {
  success: boolean;
  data: SdeSendMessageDataDto;
}

/**
 * Error response
 */
export class SdeSendMessageErrorDto {
  success: boolean;
  statusCode: number;
  message: string;
  errors?: string[];
}
