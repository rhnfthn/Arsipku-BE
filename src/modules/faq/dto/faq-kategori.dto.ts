export interface FaqKategoriData {
  id: string;
  nama: string;
  deskripsi?: string;
  created_at: Date;
  updated_at: Date;
}

export class FaqKategoriResponseDto {
  success: boolean;
  message: string;
  data: FaqKategoriData | FaqKategoriData[];
}
