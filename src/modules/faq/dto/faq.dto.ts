export interface FaqData {
  id: string;
  pertanyaan: string;
  deskripsi: string;
  kategoriId: string;
  kategoriNama: string;
  puas: number;
  tidak_puas: number;
  created_at: Date;
  updated_at: Date;
}

export class FaqResponseDto {
  success: boolean;
  message: string;
  data: FaqData | FaqData[];
}
