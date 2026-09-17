/**
 * Interface untuk data jenis
 */
export interface JenisData {
  id: string;
  jenis: string | null;
  jenis_text: string | null;
  format_penomoran: string | null;
  file_name?: string | null;
  file_url?: string | null;
  file_text?: string | null;
  file_original?: string | null;
  file_original_url?: string | null;
  file_regex?: string | null;
  file_regex_url?: string | null;
}

/**
 * Response DTO untuk jenis
 */
export class JenisResponseDto {
  success: boolean;
  message: string;
  data: JenisData[];
}
