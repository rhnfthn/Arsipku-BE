export class DisposisiRecipientDto {
  organizationId: number;
  organizationName: string;
  persnum: number;
  nama: string;
  position: number;
  positionName: string;
  positionStatus: string;
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
 * For Disposisi: only BAWAHAN (direct subordinates from child organizations)
 * Response structure matches NotaDinas but DI only uses BAWAHAN group
 */
export class DisposisiRecipientResponseDto {
  persnum: number;
  nama: string;
  position: number;
  positionStatus: string;
  organizationId: number;
  organizationName: string;
  subAreaId: number;
  recipients: DisposisiRecipientGroupDto; // ATASAN: [], BAWAHAN: [recipients], REKAN: []
  hierarchy: {
    maxDepth: number;
    totalOrganizations: number;
    totalRecipients: number;
  };
}
