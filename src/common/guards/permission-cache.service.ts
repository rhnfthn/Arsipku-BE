import { Injectable, Logger } from '@nestjs/common';

/**
 * PermissionCacheService — cache in-memory untuk permission user.
 *
 * Dipakai oleh:
 * - PermissionGuard: baca cache untuk cek permission (fallback ke DB via RbacService)
 * - RbacService: invalidate cache setelah assign/remove role atau edit permission
 *
 * Bug B1 fix: cache TTL 1 detik (safety net) → perubahan permission real-time.
 * invalidateAll() dipanggil saat superadmin save matrix → cache langsung clear.
 *
 * Cache ini bersifat per-instance (in-memory). Jika backend di-scale ke multiple
 * instance, pertimbangkan migrasi ke Redis cache.
 */
@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly CACHE_TTL_MS = 1_000; // 1 detik (safety net — invalidateAll sudah clear cache saat save)
  private readonly cache = new Map<
    number,
    {
      permissions: { resource: string; actions: string[] }[];
      expiresAt: number;
    }
  >();

  /**
   * Ambil permission dari cache jika masih valid.
   * Return null jika cache miss/expired.
   */
  get(persnum: number): { resource: string; actions: string[] }[] | null {
    const cached = this.cache.get(persnum);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(persnum);
      return null;
    }
    return cached.permissions;
  }

  /**
   * Simpan permission ke cache.
   */
  set(
    persnum: number,
    permissions: { resource: string; actions: string[] }[],
  ): void {
    this.cache.set(persnum, {
      permissions,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Invalidate cache untuk persnum tertentu.
   * Dipanggil setelah assign/remove role ke user tersebut.
   */
  invalidate(persnum: number): void {
    this.cache.delete(persnum);
  }

  /**
   * Invalidate seluruh cache.
   * Dipanggil setelah edit permission role (karena dampak ke banyak user).
   */
  invalidateAll(): void {
    this.logger.log(
      'Invalidating all permission cache (role permission changed)',
    );
    this.cache.clear();
  }

  /**
   * Cleanup entry expired — dipanggil periodik untuk mencegah memory leak.
   */
  cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, value] of this.cache) {
      if (value.expiresAt <= now) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(
        `Cleaned up ${removed} expired permission cache entries`,
      );
    }
  }

  /**
   * TTL cache (ms) — dipakai untuk dokumentasi/debug.
   */
  getTtlMs(): number {
    return this.CACHE_TTL_MS;
  }
}
