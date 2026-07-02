import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';
import { normalizeRoleName, RoleName } from '../enums/role-name.enum';
import { RbacService } from '../../modules/rbac/services/rbac.service';
import { PermissionCacheService } from './permission-cache.service';

/**
 * PermissionGuard (granular, resource+action) — V2: baca permission dari DB live.
 *
 * - Jika endpoint TIDAK punya @RequirePermission -> allow (endpoint terbuka bagi yang login)
 * - SUPERADMIN bypass aktif (per URS Poin 12: superadmin = akses penuh semua aspek sistem)
 * - Cek permission user dari DB live (via RbacService.buildActiveRoleAndPermissions)
 *   dengan cache in-memory (TTL 30 detik) untuk mitigasi performance cost.
 *
 * Didaftarkan sebagai APP_GUARD global berurutan SETELAH JwtAuthGuard.
 *
 * Bug B1 fix: sebelumnya guard baca `user.activePermissions` dari JWT (stateless),
 * sehingga perubahan permission tidak real-time. Sekarang guard query DB live
 * dengan cache 30 detik → perubahan efektif maksimal 30 detik setelah edit.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<RequiredPermission>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // Endpoint tanpa @RequirePermission -> terbuka bagi yang login
    if (!permission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    // Ambil persnum dari JWT
    const persnum: number | undefined = user.persnum;
    if (!persnum || typeof persnum !== 'number') {
      throw new ForbiddenException('Invalid user identity (no persnum)');
    }

    // Ambil permission live dari DB (dengan cache)
    // Fallback ke JWT activePermissions jika DB query gagal (graceful degradation)
    const activePermissions = await this.getLivePermissions(
      persnum,
      Array.isArray(user.activePermissions) ? user.activePermissions : undefined,
    );

    if (!activePermissions || activePermissions.length === 0) {
      throw new ForbiddenException('User has no permissions assigned');
    }

    const hasPermission = activePermissions.some(
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

  /**
   * Ambil permission user dari DB live dengan cache 30 detik.
   *
   * @param persnum - user persnum
   * @param jwtFallback - permission dari JWT, dipakai jika DB query gagal
   */
  private async getLivePermissions(
    persnum: number,
    jwtFallback?: { resource: string; actions: string[] }[],
  ): Promise<{ resource: string; actions: string[] }[] | null> {
    // Cek cache
    const cached = this.permissionCache.get(persnum);
    if (cached) return cached;

    // Cache miss → query DB
    try {
      const ctx = await this.rbacService.buildActiveRoleAndPermissions(persnum);
      const permissions = ctx.activePermissions ?? [];

      // Simpan ke cache
      this.permissionCache.set(persnum, permissions);

      // Cleanup entry expired (lazy)
      this.permissionCache.cleanupExpired();

      return permissions;
    } catch (error) {
      this.logger.error(
        `Failed to fetch permissions for persnum ${persnum}: ${error}`,
      );
      // Fallback: gunakan JWT activePermissions jika ada (graceful degradation)
      return jwtFallback ?? null;
    }
  }
}