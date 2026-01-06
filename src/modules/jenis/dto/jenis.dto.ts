/**
 * Interface untuk data jenis
 */
export interface JenisData {
  id: string;
  jenis: string | null;
  jenis_text: string | null;
  format_penomoran: string | null;
}

/**
 * Response DTO untuk jenis
 */
export class JenisResponseDto {
  success: boolean;
  message: string;
  data: JenisData[];
}
