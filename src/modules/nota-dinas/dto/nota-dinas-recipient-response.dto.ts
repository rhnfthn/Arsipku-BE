import { IsOptional, IsString, Matches, IsNumberString } from 'class-validator';

/**
 * Query DTO untuk GET /ND/get-recipient
 */
export class GetRecipientQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'pengirim must be a valid number' })
  pengirim?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'position must be a valid number' })
  position?: string;
}

/**
 * Response item DTO berdasarkan struktur position_json dari org_data
 */
export class OrgDataPositionDto {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number;
  departType: string | null;
  bod_tag: string | null;

  persnum_person: number | null;
  persnum_person_text: string | null;
  position_status?: string | null;
  positionStatus?: string | null;
  delegation_id?: string | null;
  is_delegated?: boolean;

  organization_id: number;
  organization_text: string;
  organization_abbreviation: string | null;
  organization_parent: number | null;
  organization_parent_text: string | null;

  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;

  level: number;

  divisi_id: number | null;
  divisi_name: string | null;
  direktorat_id: number | null;
  direktorat_name: string | null;

  company: number | null;
  company_name: string | null;
}

/**
 * Response DTO dengan grouping ATASAN, REKAN, BAWAHAN
 */
export class NotaDinasRecipientGroupDto {
  ATASAN: OrgDataPositionDto[];
  REKAN: OrgDataPositionDto[];
  BAWAHAN: OrgDataPositionDto[];
}

/**
 * Response DTO untuk endpoint GET /ND/get-recipient/:positionId
 */
export class NotaDinasRecipientResponseDto {
  sender: OrgDataPositionDto;
  recipients: NotaDinasRecipientGroupDto;
}
