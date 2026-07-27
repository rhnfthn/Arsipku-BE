import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RoleName } from '../../../common/enums/role-name.enum';

export class CreateRoleDto {
  @IsEnum(RoleName)
  name: RoleName;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsEnum(RoleName)
  name?: RoleName;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
