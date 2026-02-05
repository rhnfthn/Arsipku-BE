/**
 * Position data from org_data.position_json
 * Used for detailed recipient information
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
 * Grup Penerima Detail with enriched position data
 */
export class GrupPenerimaDetailResponseDto {
  id: string;
  id_grup_penerima: string;
  position: string;
  position_detail: OrgDataPositionDto | null;
}

/**
 * Grup Penerima with enriched detail data
 */
export class GrupPenerimaResponseDto {
  id: string;
  company: string;
  area: string;
  nama: string;
  deskripsi: string | null;
  deskripsi_english: string | null;
  urutan: number;
  aktif: boolean;
  details: GrupPenerimaDetailResponseDto[];
}

/**
 * Query DTO for GET /persuratan/grup-penerima
 */
export class GetGrupPenerimaQueryDto {
  company?: string;
  area?: string;
  tgl?: string; // Format: YYYY-MM-DD, untuk lookup org_data
}
