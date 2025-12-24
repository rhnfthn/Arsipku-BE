/**
 * Response DTO untuk count unread inbox messages
 */
export class CountUnreadInboxResponseDto {
  success: boolean;
  message: string;
  data: {
    position_id: number;
    count: number;
  };
}
