export class NotaDinasRecipientDto {
  organizationId: number;
  organizationName: string;
  persnum: number;
  nama: string;
  position: number;
  positionName: string;
}

export class NotaDinasRecipientGroupDto {
  ATASAN: NotaDinasRecipientDto[];
  BAWAHAN: NotaDinasRecipientDto[];
  REKAN: NotaDinasRecipientDto[];
}

export class NotaDinasRecipientResponseDto {
  persnum: number;
  nama: string;
  position: number;
  organizationId: number;
  organizationName: string;
  subAreaId: number;
  recipients: NotaDinasRecipientGroupDto;
}
