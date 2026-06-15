import { IsEnum, IsNotEmpty, IsInt } from 'class-validator';
import { UserRole } from '../entities/user-role.entity';

export class AssignRoleDto {
  @IsEnum(UserRole, { message: 'Role harus admin atau superadmin' })
  @IsNotEmpty()
  role: UserRole;
}

export class AssignRoleResponseDto {
  success: boolean;
  message: string;
  data: {
    persnum: number;
    role: UserRole;
    assigned_by: number;
    assigned_at: Date;
  };
}

export class UpdateRoleResponseDto {
  success: boolean;
  message: string;
  data: {
    persnum: number;
    previous_role: string;
    new_role: UserRole;
    updated_by: number;
    updated_at: Date;
  };
}
