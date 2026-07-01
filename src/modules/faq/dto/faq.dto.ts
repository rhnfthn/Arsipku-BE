export interface FaqData {
  id: string;
  pertanyaan: string;
  deskripsi: string;
  kategoriId: string;
  kategoriNama: string;
  puas: number;
  tidak_puas: number;
  fileUrl?: string;
  lampirans?: { url: string; name: string }[];
  userVote?: string | null;
  created_at: Date;
  updated_at: Date;
}

export class FaqResponseDto {
  success: boolean;
  message: string;
  data: FaqData | FaqData[];
}
