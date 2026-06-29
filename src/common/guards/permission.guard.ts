import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';
import { normalizeRoleName, RoleName } from '../enums/role-name.enum';

/**
 * PermissionGuard (granular, resource+action)
 *
 * - Jika endpoint TIDAK punya @RequirePermission -> allow (endpoint terbuka bagi yang login)
 * - SUPERADMIN bypass aktif (per URS Poin 12: superadmin = akses penuh semua aspek sistem)
 * - Cek user.activePermissions: { resource, actions[] }[]
 *
 * Didaftarkan sebagai APP_GUARD global berurutan SETELAH JwtAuthGuard.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.get<RequiredPermission>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    if (!permission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    // SUPERADMIN bypass
    const activeRoleName = normalizeRoleName(user?.activeRole?.name ?? user?.role);
    if (activeRoleName === RoleName.SUPERADMIN) return true;

    if (!user.activePermissions || !Array.isArray(user.activePermissions)) {
      throw new ForbiddenException('User has no permissions assigned');
    }

    const hasPermission = user.activePermissions.some(
      (p: { resource: string; actions: string[] }) =>
        p.resource === permission.resource && p.actions.includes(permission.action),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required: ${permission.resource}.${permission.action}`,
      );
    }
    return true;
  }
}