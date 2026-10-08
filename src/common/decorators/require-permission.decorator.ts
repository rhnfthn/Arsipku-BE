import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

export type RequiredPermissionMetadata = RequiredPermission | RequiredPermission[];

/**
 * Decorator untuk menandai endpoint membutuhkan permission granular.
 * @RequirePermission('resource', 'action')
 * Contoh: @RequirePermission('penomoran', 'verify')
 */
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action } as RequiredPermission);

/**
 * Menandai endpoint yang dapat dibuka dengan salah satu permission.
 * Dipakai pada detail penyusutan karena detail yang sama diakses dari
 * Pengajuan Penyusutan maupun Penataan dan Pemusnahan.
 */
export const RequireAnyPermission = (...permissions: RequiredPermission[]) =>
  SetMetadata(PERMISSION_KEY, permissions as RequiredPermission[]);
