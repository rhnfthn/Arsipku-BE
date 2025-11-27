// Response DTO untuk send-message SDI
export class SirkulasiInfoDto {
  persnum: number;
  nama: string;
  position: number;
  positionText: string;
  organization: number;
  organizationText: string;
}

export class SendMessageDataDto {
  id: string;
  jenis: string;
  nomor: string;
  tanggal: string;
  status: string;
  perihal: string;
  pengirim: SirkulasiInfoDto;
  penerima: SirkulasiInfoDto[];
  tembusan: SirkulasiInfoDto[];
}

export class SendMessageResponseDto {
  success: boolean;
  data: SendMessageDataDto;
}

// Error response
export class SendMessageErrorDto {
  success: boolean;
  statusCode: number;
  message: string;
  errors?: string[];
}
