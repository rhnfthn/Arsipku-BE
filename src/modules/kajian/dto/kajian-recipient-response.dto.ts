import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query DTO untuk GET /KA/get-recipient
 */
export class GetRecipientQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tgl must be in format YYYY-MM-DD',
  })
  tgl?: string;
}

/**
 * Response item DTO berdasarkan struktur position_json dari org_data
 * (Sama dengan Nota Dinas)
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
 * Untuk Kajian: hanya ATASAN yang berisi, REKAN & BAWAHAN selalu kosong
 */
export class KajianRecipientGroupDto {
  ATASAN: OrgDataPositionDto[];
  REKAN: OrgDataPositionDto[];
  BAWAHAN: OrgDataPositionDto[];
}

/**
 * Response DTO untuk endpoint GET /KA/get-recipient/:positionId
 */
export class KajianRecipientResponseDto {
  sender: OrgDataPositionDto;
  recipients: KajianRecipientGroupDto;
}

// Legacy exports untuk backward compatibility
export { OrgDataPositionDto as KajianRecipientDto };
export { OrgDataPositionDto as KajianSenderData };
