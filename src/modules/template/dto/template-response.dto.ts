export class TemplateDto {
  id: string;
  tanggal?: string | null;
  nama_template: string;
  file: string;          // Key file di MinIO
  file_url?: string;     // Signed URL untuk akses file
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
