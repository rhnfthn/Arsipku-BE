export class TemplateSuratDto {
  id: string;
  id_position: string;
  nama_template: string;
  content?: string | null; // HTML content
  create_at?: string;
  update_at?: string;
}

export class TemplateSuratListResponseDto {
  success: boolean;
  total: number;
  data: TemplateSuratDto[];
}

export class TemplateSuratItemResponseDto {
  success: boolean;
  data: TemplateSuratDto;
}

export class TemplateSuratActionResponseDto {
  success: boolean;
  message: string;
  data?: TemplateSuratDto;
}
