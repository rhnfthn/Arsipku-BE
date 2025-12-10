import { IsOptional, IsString, IsEnum } from 'class-validator';
import { UserRole } from '../entities/user-role.entity';

export class SearchUsersDto {
  @IsOptional()
  @IsString()
  search?: string; // Search by name, uname, or persnum

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole; // Filter by role
}

export class UserListItemDto {
  persnum: number;
  name: string;
  uname: string;
  role: UserRole | null;
  status: 'aktif' | 'tidak_aktif';
  assigned_at: Date | null;
}

export class SearchUsersResponseDto {
  success: boolean;
  message: string;
  data: {
    users: UserListItemDto[];
    summary: {
      total: number;
      total_admin: number;
      total_superadmin: number;
      total_regular_users: number;
    };
  };
}
