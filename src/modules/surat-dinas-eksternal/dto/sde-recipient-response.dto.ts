import { IsOptional, IsString, Matches, IsNumberString } from 'class-validator';

/**
 * Query DTO for SDE get-recipient endpoint
 */
export class GetSdeRecipientQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'pengirim must be a valid number' })
  pengirim?: string;
}

/**
 * Position data from org_data.position_json
 * Same structure as SDI/ND
 */
export class SdeOrgDataPositionDto {
  company: number;
  position: number;
  position_text: string;
  position_abbreviation?: string | null;
  persnum: number;
  // Optional fields when org_data provides person details for the position
  divisi_id?: number | null;
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
  bod_tag: string | null;
  departType: string | null;
}

/**
 * External recipient (pihak luar perusahaan)
 * Dari tabel eksternal
 */
export class EksternalRecipientDto {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  kontak: string;
}

/**
 * Response DTO for SDE get-recipient
 * 
 * SDE (Surat Dinas Eksternal):
 * - sender: dari org_data (positionId)
 * - recipients: dari tabel eksternal (pihak luar)
 */
export class SdeRecipientResponseDto {
  sender: SdeOrgDataPositionDto;
  recipients: EksternalRecipientDto[];
  totalRecipients: number;
}

/**
 * Response DTO for SDE get-tembusan
 * 
 * Tembusan recipients for SDE (same logic as SDI tembusan):
 * - Filter internal positions (org_data)
 * - chief=1 (managerial), bod_tag='BOD', same company
 */
export class SdeTembusanResponseDto {
  sender: SdeOrgDataPositionDto;
  tembusan: SdeOrgDataPositionDto[];
  totalTembusan: number;
}
