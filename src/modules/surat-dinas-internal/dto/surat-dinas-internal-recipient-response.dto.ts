import { IsOptional, IsString, Matches, IsNumberString } from 'class-validator';

/**
 * Query DTO for SDI get-recipient endpoint
 */
export class GetSdiRecipientQueryDto {
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
 */
export class SdiOrgDataPositionDto {
  company: number;
  position: number;
  position_text: string;
  position_abbreviation?: string | null;
  persnum: number;
  // Optional fields when org_data provides person details for the position
  divisi_id?: number | null;
  persnum_person?: number | null;
  persnum_person_text?: string | null;
  position_status?: string | null;
  positionStatus?: string | null;
  delegation_id?: string | null;
  is_delegated?: boolean;
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
  routing_source?: 'structural' | 'configured';
  routing_rule_ids?: string[];
  routing_effect?: 'ALLOW_SELECT' | 'AUTO_INCLUDE';
  routing_mandatory?: boolean;
}

/**
 * Recipient group for SDI
 * SDI only has REKAN (no ATASAN/BAWAHAN)
 */
export class SdiRecipientGroupDto {
  REKAN: SdiOrgDataPositionDto[];
  TEMBUSAN?: SdiOrgDataPositionDto[];
}

/**
 * Response DTO for SDI get-recipient
 */
export class SdiRecipientResponseDto {
  sender: SdiOrgDataPositionDto;
  recipients: SdiRecipientGroupDto;
}
