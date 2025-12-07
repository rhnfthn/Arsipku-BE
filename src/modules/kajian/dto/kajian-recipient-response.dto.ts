export class KajianRecipientDto {
  organizationId: number;
  organizationName: string;
  persnum: number | null;
  nama: string | null;
  position: number;
  positionName: string;
  positionStatus: string;
}

/**
 * Grouping recipients for Kajian (KA)
 * KA: Fungsional/Staf ke Managerial/Fungsional dalam Sub Area yang sama
 * - ATASAN: atasan langsung & tidak langsung (same sub_area)
 * - BAWAHAN: [] (KA tidak boleh ke bawahan)
 * - REKAN: [] (KA tidak boleh ke rekan)
 */
export class KajianRecipientGroupDto {
  ATASAN: KajianRecipientDto[];
  BAWAHAN: KajianRecipientDto[];
  REKAN: KajianRecipientDto[];
}

// Interface untuk sender data (dari org_data)
export interface KajianSenderData {
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

export class KajianRecipientResponseDto {
  sender: KajianSenderData;
  recipients: KajianRecipientGroupDto;
  hierarchy: {
    totalOrganizations: number;
    totalRecipients: number;
  };
}
