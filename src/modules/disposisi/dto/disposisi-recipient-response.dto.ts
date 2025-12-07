/**
 * Recipient DTO matching org_data position_json structure
 */
export class DisposisiRecipientDto {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number;
  departType: string | null;
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
 * Grouping recipients for Disposisi
 * For DI: ONLY BAWAHAN is populated, ATASAN and REKAN are empty arrays
 */
export class DisposisiRecipientGroupDto {
  ATASAN: DisposisiRecipientDto[];
  BAWAHAN: DisposisiRecipientDto[];
  REKAN: DisposisiRecipientDto[];
}

/**
 * Sender info matching org_data position_json structure
 */
export class DisposisiSenderDto {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number;
  departType: string | null;
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
 * For Disposisi: only BAWAHAN (direct subordinates from child organizations)
 * Response structure uses org_data position_json format
 * Now uses position_id as primary identifier instead of persnum
 */
export class DisposisiRecipientResponseDto {
  sender: DisposisiSenderDto;
  recipients: DisposisiRecipientGroupDto; // ATASAN: [], BAWAHAN: [recipients], REKAN: []
  hierarchy: {
    maxDepth: number;
    totalOrganizations: number;
    totalRecipients: number;
  };
}
