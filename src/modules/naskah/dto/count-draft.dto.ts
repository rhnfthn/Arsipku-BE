/**
 * Response DTO untuk count draft naskah berdasarkan position id
 */
export class CountDraftNaskahResponseDto {
  success: boolean;
  message: string;
  data: {
    position_id: number;
    count: number;
  };
}
