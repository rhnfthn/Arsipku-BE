export class SuratDinasInternalRecipientDto {
  organizationId: number;
  organizationName: string;
  areaId: string;
  subAreaId: number;
  persnum: number;
  nama: string;
  position: number;
  positionName: string;
}

export class SuratDinasInternalRecipientGroupDto {
  ATASAN: SuratDinasInternalRecipientDto[];
  BAWAHAN: SuratDinasInternalRecipientDto[];
  REKAN: SuratDinasInternalRecipientDto[];
}

export class SuratDinasInternalRecipientResponseDto {
  persnum: number;
  nama: string;
  position: number;
  organizationId: number;
  organizationName: string;
  areaId: string;
  subAreaId: number;
  recipients: SuratDinasInternalRecipientGroupDto;
}
