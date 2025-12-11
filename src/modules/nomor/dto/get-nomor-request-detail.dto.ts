/**
 * Response DTO untuk get detail usulan nomor (usulan request only)
 */
export class GetNomorRequestDetailResponseDto {
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
    created_at: Date;
    status: string;
  };
}

/**
 * Response DTO untuk get detail penomoran (usulan + details)
 */
export class GetNomorDetailPenomoranResponseDto {
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
    details: {
      id: string;
      nomor: string | null;
      status: string;
      file_name: string | null;
      file_text: string | null;
      created_at: Date;
    }[];
  };
}
