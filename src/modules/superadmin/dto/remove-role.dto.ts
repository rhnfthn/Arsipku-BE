export class RemoveRoleResponseDto {
  success: boolean;
  message: string;
  data: {
    persnum: number;
    previous_role: string;
    removed_by: number;
    removed_at: Date;
  };
}
