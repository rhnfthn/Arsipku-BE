export class TemplateDto {
  id: string;
  id_position: string;
  nama_template: string;
  content?: string | null;  // HTML content
  create_at?: string;
  update_at?: string;
}

export class TemplateListResponseDto {
  success: boolean;
  total: number;
  data: TemplateDto[];
}

export class TemplateItemResponseDto {
  success: boolean;
  data: TemplateDto;
}

export class TemplateActionResponseDto {
  success: boolean;
  message: string;
  data?: TemplateDto;
}
