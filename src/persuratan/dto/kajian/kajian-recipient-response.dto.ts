export class KajianRecipientDto {
  organizationId: number;
  organizationName: string;
  persnum: number;
  nama: string;
  position: number;
  positionName: string;
  positionStatus: string;
}

/**
 * Grouping recipients for Kajian (KA)
 * KA: Fungsional/Staf ke Managerial/Fungsional dalam Sub Area yang sama
 * - ATASAN: atasan langsung & tidak langsung (same sub_area)
 * - BAWAHAN: [] (KA tidak boleh ke bawahan)
 * - REKAN: sesama level dalam sub_area yang sama
 */
export class KajianRecipientGroupDto {
  ATASAN: KajianRecipientDto[];
  BAWAHAN: KajianRecipientDto[];
  REKAN: KajianRecipientDto[];
}

export class KajianRecipientResponseDto {
  persnum: number;
  nama: string;
  position: number;
  positionStatus: string;
  organizationId: number;
  organizationName: string;
  subAreaId: number;
  recipients: KajianRecipientGroupDto;
  hierarchy: {
    totalOrganizations: number;
    totalRecipients: number;
  };
}
