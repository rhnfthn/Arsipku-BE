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
import { ALLOW_VIEWER_WRITE_KEY } from '../decorators/allow-viewer-write.decorator';
import { RoleName } from '../enums/role-name.enum';
import { PositionStatus } from '../../common/enums/position-status.enum';
import {
  computeEffectivePersnum,
  isDelegatedActor,
} from '../../common/helpers/delegasi-rendering.helper';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
import { RbacService } from '../../modules/rbac/services/rbac.service';
import { PermissionCacheService } from './permission-cache.service';

/**
 * PermissionGuard (granular, resource+action) — V2: baca permission dari DB live.
 *
 * - Jika endpoint TIDAK punya @RequirePermission -> allow (endpoint terbuka bagi yang login)
 * - SUPERADMIN juga dicek permission-nya via DB (no bypass — Opsi C hybrid)
 * - Cek permission user dari DB live (via RbacService.buildActiveRoleAndPermissions)
 *   dengan cache in-memory (TTL 1 detik) — invalidateAll dipanggil saat save matrix.
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
  private readonly VIEW_ONLY_STATUSES = new Set<string>([
    PositionStatus.VI,
    PositionStatus.SE,
  ]);

  private stripToReadOnly(
    perms: { resource: string; actions: string[] }[],
  ): { resource: string; actions: string[] }[] {
    // Copy — never mutate cached entries.
    return perms
      .map((p) => ({
        resource: p.resource,
        actions: p.actions.filter((a) => a === 'read' || a === 'read-detail'),
      }))
      .filter((p) => p.actions.length > 0);
  }

  private readonly WRITE_METHODS = new Set<string>([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ]);
  private readonly VIEW_ONLY_WRITE_ALLOW_PREFIX = [
    '/auth',
    '/notification',
    '/fcm',
    '/short-url',
  ];
  private readonly VIEW_ONLY_WRITE_ALLOW_EXACT = ['/delegasi/switch-role'];

  /**
   * SE (Sekretaris yang didelegasikan) diizinkan melakukan aksi tulis pada
   * resource usulan-akses-berkas (membuat/memilih berkas), naskah-share
   * (membagikan/mencabut akses naskah), dan transfer-active-to-inactive
   * (membuat/mengedit usulan pemindahan arsip). VI tetap read-only penuh.
   */
  private readonly SE_WRITE_ALLOW_PREFIX = [
    '/usulan-akses-berkas',
    '/naskah-share',
    '/transfer-active-to-inactive',
  ];

  private isAllowListedForViewer(path: string): boolean {
    const p = path.split('?')[0];
    if (this.VIEW_ONLY_WRITE_ALLOW_EXACT.includes(p)) return true;
    return this.VIEW_ONLY_WRITE_ALLOW_PREFIX.some(
      (prefix) => p === prefix || p.startsWith(prefix + '/'),
    );
  }

  private blockViewerWrite(
    user: JwtPayload | undefined,
    req: { method?: string; url?: string },
    allowedStatuses?: string[],
  ): void {
    if (!user) return;
    const ps = user.position_status as string | undefined;
    if (!ps || !this.VIEW_ONLY_STATUSES.has(ps)) return;
    if (!req.method || !this.WRITE_METHODS.has(req.method)) return;
    if (allowedStatuses?.includes(ps)) return; // SE di-allow untuk route ini
    if (this.isAllowListedForViewer(req.url || '')) return;
    // Pengecualian: SE (Sekretaris) boleh write ke /usulan-akses-berkas
    if (ps === PositionStatus.SE) {
      const p = (req.url || '').split('?')[0];
      if (
        this.SE_WRITE_ALLOW_PREFIX.some(
          (prefix) => p === prefix || p.startsWith(prefix + '/'),
        )
      ) {
        return;
      }
    }
    throw new ForbiddenException(
      'Akses lihat saja (read-only): tidak dapat melakukan aksi tulis dalam delegasi ini.',
    );
  }

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 🛡️ VI/SE method-block — BEFORE the un-guarded early-return so it covers
    // endpoints without @RequirePermission too.
    const req = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload; method?: string; url?: string }>();
    const allowedViewerStatuses = this.reflector.getAllAndOverride<
      string[] | undefined
    >(ALLOW_VIEWER_WRITE_KEY, [context.getHandler(), context.getClass()]);
    this.blockViewerWrite(req.user, req, allowedViewerStatuses);

    const permission = this.reflector.get<RequiredPermission>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // Endpoint tanpa @RequirePermission -> terbuka bagi yang login
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
    }>();
    const user: JwtPayload | undefined = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    // 🛡️ SUPERADMIN bypass — selalu lolos (README §3.2 rule 2)
    const activeRoleName =
      user.activeRole?.name ??
      (user.role ? String(user.role).toUpperCase() : undefined);
    if (
      activeRoleName &&
      activeRoleName.toUpperCase() === String(RoleName.SUPERADMIN)
    ) {
      return true;
    }

    // Ambil persnum EFEKTIF dari JWT (delegasi sadar).
    // The `delegasi` resource is the delegation CONTROL PLANE (switch/reset/manage
    // delegations) — always authorized by the delegate's OWN perms, never the
    // delegator's, and never VI/SE-stripped. Otherwise a delegated user could not
    // switch back to their original role (locked into the delegation).
    //
    // `usulan-akses-berkas` resource: SE (Sekretaris yang didelegasikan) adalah
    // aktor utama fitur ini. Permission harus dari delegate's OWN persnum (bukan
    // delegator's), karena delegator (EVP/VP/AVP) mungkin tidak punya role di
    // rbac_user_role. Delegate (SE) sudah punya role USER/ADMIN yang include
    // usulan-akses-berkas permissions.
    //
    // `naskah-share` resource: SE juga aktor utama (membagikan/mencabut akses
    // naskah). Sama — pakai delegate's OWN persnum.
    const isDelegasiResource = permission.resource === 'delegasi';
    const isUsulanAksesBerkasResource =
      permission.resource === 'usulan-akses-berkas';
    const isNaskahShareResource = permission.resource === 'naskah-share';
    const useOwnPersnum =
      isDelegasiResource || isUsulanAksesBerkasResource || isNaskahShareResource;
    const persnum: number = useOwnPersnum
      ? user.persnum
      : computeEffectivePersnum(user);
    if (!persnum || typeof persnum !== 'number') {
      throw new ForbiddenException('Invalid user identity (no persnum)');
    }

    // Ambil permission live dari DB (dengan cache).
    // Delegated actors on business resources: fail-closed (no JWT fallback).
    // delegasi control plane & usulan-akses-berkas (own persnum): use the delegate's own JWT fallback.
    const isActorDelegated = isDelegatedActor(user);
    const jwtFallback =
      isActorDelegated && !useOwnPersnum
        ? undefined
        : Array.isArray(user.activePermissions)
          ? user.activePermissions
          : undefined;
    const activePermissions = await this.getLivePermissions(
      persnum,
      jwtFallback,
    );

    // VI/SE: strip ke read-only (copy, bukan mutate cache) — only for business
    // resources, NOT the delegasi control plane (so switch/reset still works).
    // ALSO NOT for usulan-akses-berkas & naskah-share (SE is the main actor:
    // create/verify/select-files, share/revoke).
    const isViewOnly =
      !isDelegasiResource &&
      !isUsulanAksesBerkasResource &&
      !isNaskahShareResource &&
      !!user.position_status &&
      this.VIEW_ONLY_STATUSES.has(user.position_status as string);
    const effectivePermissions = isViewOnly
      ? this.stripToReadOnly(activePermissions ?? [])
      : (activePermissions ?? []);

    if (!effectivePermissions || effectivePermissions.length === 0) {
      throw new ForbiddenException('User has no permissions assigned');
    }

    const hasPermission = effectivePermissions.some(
      (p: { resource: string; actions: string[] }) =>
        p.resource === permission.resource &&
        p.actions.includes(permission.action),
    );

    if (!hasPermission) {
      this.logger.warn(
        `Access denied for persnum=${persnum} position_status=${user.position_status} resource=${permission.resource}.${permission.action} — effectivePermissions: ${JSON.stringify(effectivePermissions.map((p) => p.resource + ':' + p.actions.join(',')))}`,
      );
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
