export class DisposisiRecipientDto {
  organizationId: number;
  organizationName: string;
  persnum: number;
  nama: string;
  position: number;
  positionName: string;
  positionStatus: string;
  level: number;
  type: 'DIRECT_SUBORDINATE' | 'INDIRECT_SUBORDINATE';
}

/**
 * For Disposisi: only BAWAHAN (direct subordinates from child organizations)
 */
export class DisposisiRecipientResponseDto {
  persnum: number;
  nama: string;
  position: number;
  positionStatus: string;
  organizationId: number;
  organizationName: string;
  subAreaId: number;
  recipients: DisposisiRecipientDto[]; // ONLY recipients (bawahan)
  hierarchy: {
    maxDepth: number;
    totalOrganizations: number;
    totalRecipients: number;
  };
}
