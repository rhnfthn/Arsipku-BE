import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AssignRoleDto {
  @IsString()
  roleId: string;

  @IsOptional()
  @IsString()
  unitKerja?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
