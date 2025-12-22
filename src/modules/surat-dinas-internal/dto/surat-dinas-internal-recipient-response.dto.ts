import { IsOptional, IsString, Matches } from 'class-validator';

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
 * Recipient group for SDI
 * SDI only has REKAN (no ATASAN/BAWAHAN)
 */
export class SdiRecipientGroupDto {
  REKAN: SdiOrgDataPositionDto[];
}

/**
 * Response DTO for SDI get-recipient
 */
export class SdiRecipientResponseDto {
  sender: SdiOrgDataPositionDto;
  recipients: SdiRecipientGroupDto;
}
