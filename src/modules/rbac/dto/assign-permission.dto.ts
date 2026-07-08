import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Body: { permissionIds, matrixPermissionIds? }
 * - permissionIds: ID permission yang dipilih (checked) di matrix.
 * - matrixPermissionIds (opsional): SEMUA ID permission yang ada di matrix tree
 *   (lintas semua tab). Jika diberikan, backend HANYA akan menghapus permission
 *   yang ada di matrixPermissionIds tapi tidak di permissionIds.
 *   Permission di luar scope matrix (mis. naskah-dinas:read-detail untuk digsig)
 *   akan dipertahankan agar backend API tetap berfungsi.
 */
export class AssignPermissionDto {
  @IsArray()
  @IsString({ each: true })
  permissionIds: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  matrixPermissionIds?: string[];
}