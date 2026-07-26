import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query DTO for Naskah Dinas get-recipient endpoint
 */
export class GetNaskahDinasRecipientQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;
}

/**
 * Position data from org_data.position_json (penerima internal)
 */
export class NdOrgDataPositionDto {
  position: number;
  position_text: string;
  position_abbreviation?: string | null;
  persnum: number;
  persnum_person?: number | null;
  persnum_person_text?: string | null;
  nama: string;
  organization_id: number;
  organization_text: string;
  organization_parent: number | null;
  sub_area: number;
  sub_area_text: string;
  area: string;
  area_text: string;
  level: number;
  chief: number;
  departType: string | null;
}

/**
 * External sender (pengirim eksternal)
 * Dari tabel eksternal
 */
export class EksternalSenderDto {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  kontak: string;
}

/**
 * Response DTO for Naskah Dinas get-recipient
 *
 * Menampilkan daftar recipients (penerima) dari org_data
 * - recipients: dari org_data (positionId internal) dengan chief=1
 */
export class NaskahDinasRecipientResponseDto {
  recipients: NdOrgDataPositionDto[];
  totalRecipients: number;
}
