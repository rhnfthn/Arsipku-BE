import { Global, Module } from '@nestjs/common';
import { PermissionCacheService } from './permission-cache.service';

/**
 * Global module yang menyediakan PermissionCacheService ke seluruh aplikasi.
 *
 * Dipakai oleh:
 * - PermissionGuard (common/guards) untuk baca cache permission
 * - RbacService (modules/rbac) untuk invalidate cache setelah edit permission/role
 *
 * @Global → tidak perlu import di setiap module yang butuh PermissionCacheService.
 */
@Global()
@Module({
  providers: [PermissionCacheService],
  exports: [PermissionCacheService],
})
export class CommonGuardsModule {}