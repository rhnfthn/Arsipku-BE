/**
 * Response DTO untuk get nomor request (user view)
 */
export class GetMyNomorRequestResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    company: string;
    area: string;
    sub_area: string;
    organization: string;
    position: string;
    tanggal: Date;
    jenis: string;
    klasifikasi: string | null;
    perihal: string;
    jumlah: number;
    penandatangan: string | null;
    created_at: Date;
    details?: {
      id: string;
      nomor: string | null;
      status: string;
      file_name: string | null;
      created_at: Date;
    }[];
  }[];
}

/**
 * Response DTO untuk get nomor request (admin view)
 */
export class GetAdminNomorRequestResponseDto {
  success: boolean;
  message: string;
  data: {
    id: string;
    company: string;
    area: string;
    sub_area: string;
    organization: string;
    position: string;
    persnum: number | null;
    nama: string | null;
    tanggal: Date;
    jenis: string;
    klasifikasi: string | null;
    perihal: string;
    jumlah: number;
    penandatangan: string | null;
    created_at: Date;
    status: string;
  }[];
}
