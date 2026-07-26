import {
  EksternalSenderDto,
  NdOrgDataPositionDto,
} from './naskah-dinas-recipient.dto';

/**
 * Info pengirim eksternal
 */
export class NdPengirimInfoDto {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  kontak: string;
}

/**
 * Info penerima internal dari org_data
 */
export class NdPenerimaInfoDto {
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
 * Info pembuat (sama seperti penerima, diambil dari org_data)
 */
export class NdPembuatInfoDto {
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

export class NdVerifikatorProgressDto {
  verified: number;
  total: number;
  rejected: number;
  currentOrder: number | null;
  status: 'none' | 'on_progress' | 'completed' | 'rejected';
}

export class NdVerifikatorInfoDto {
  id: string;
  urutan: number;
  persnum: number;
  nama: string | null;
  jabatan: string | null;
  lokasi: string | null;
  positionId: number | null;
  status: 'pending' | 'waiting' | 'verified' | 'rejected';
  verifiedAt: Date | null;
  rejectedAt: Date | null;
  keterangan: string | null;
}

/**
 * Data response untuk send-message Naskah Dinas
 */
export class NdSendMessageDataDto {
  id: string;
  jenis: string;
  nomor: string | null;
  tanggal: string;
  jam: string; // UTC timestamp
  status: string;
  sifat: string | null;
  klasifikasi: string | null;
  lampiran: string | null;
  perihal: string;
  final_pdf: string | null;
  final_pdf_url: string | null;
  pengirim: NdPengirimInfoDto;
  penerima: NdPenerimaInfoDto[];
  pembuat: NdPembuatInfoDto | null;
  verifikatorProgress: NdVerifikatorProgressDto;
  totalVerifikator: number;
  verifikators: NdVerifikatorInfoDto[];
}

/**
 * Response DTO untuk send-message Naskah Dinas
 */
export class NdSendMessageResponseDto {
  success: boolean;
  data: NdSendMessageDataDto;
}

/**
 * Response DTO untuk get-all Naskah Dinas (tanpa pagination)
 */
export class NdGetAllResponseDto {
  success: boolean;
  data: NdSendMessageDataDto[];
  total: number;
}

/**
 * Response DTO untuk get-detail Naskah Dinas
 */
export class NdGetDetailResponseDto {
  success: boolean;
  data: NdSendMessageDataDto;
}

/**
 * Error response
 */
export class NdErrorDto {
  success: boolean;
  statusCode: number;
  message: string;
  errors?: string[];
}
