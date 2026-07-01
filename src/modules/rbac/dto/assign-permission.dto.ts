import { IsArray, IsString } from 'class-validator';

/**
 * Body: { permissionIds: string[] } — replace seluruh permission milik role.
 */
export class AssignPermissionDto {
  @IsArray()
  @IsString({ each: true })
  permissionIds: string[];
}