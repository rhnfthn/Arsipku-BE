import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

/**
 * Decorator untuk menandai endpoint membutuhkan permission granular.
 * @RequirePermission('resource', 'action')
 * Contoh: @RequirePermission('penomoran', 'verify')
 */
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action } as RequiredPermission);
