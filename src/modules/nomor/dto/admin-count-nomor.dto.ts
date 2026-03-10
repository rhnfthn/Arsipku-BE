/**
 * Response DTO untuk admin count nomor request by status
 */
export class AdminCountNomorRequestResponseDto {
  success: boolean;
  message: string;
  data: {
    menunggu_verifikasi: number;
    disetujui: number;
    ditolak: number;
    belum_diajukan: number;
    menunggu_persetujuan?: number;
    total: number;
  };
}
