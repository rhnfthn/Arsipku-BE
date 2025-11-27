/**
 * External recipient (pihak luar perusahaan)
 */
export class EksternalRecipientDto {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  kontak: string;
}

/**
 * Sender info (internal LPPNPI)
 */
export class SdeSenderDto {
  persnum: number;
  nama: string;
  position: number;
  positionName: string;
  positionStatus: string;
  organizationId: number;
  organizationName: string;
  subAreaId: number;
  isAuthorized: boolean; // Apakah berwenang kirim surat eksternal
}

/**
 * Response untuk GET /SDE/get-recipient/:persnum
 */
export class SdeRecipientResponseDto {
  sender: SdeSenderDto;
  recipients: EksternalRecipientDto[]; // List pihak eksternal yang bisa dipilih
  totalRecipients: number;
}
