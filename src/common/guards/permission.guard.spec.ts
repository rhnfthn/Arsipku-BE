import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { PermissionCacheService } from './permission-cache.service';
import { RbacService } from '../../modules/rbac/services/rbac.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { RoleName } from '../enums/role-name.enum';
import { PositionStatus } from '../enums/position-status.enum';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: any;
  let rbacService: any;
  let permissionCache: any;

  beforeEach(async () => {
    reflector = { get: jest.fn(), getAllAndOverride: jest.fn(() => undefined) };
    rbacService = {
      buildActiveRoleAndPermissions: jest.fn(),
    };
    permissionCache = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      invalidateAll: jest.fn(),
      cleanupExpired: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        { provide: Reflector, useValue: reflector },
        { provide: RbacService, useValue: rbacService },
        { provide: PermissionCacheService, useValue: permissionCache },
      ],
    }).compile();

    guard = module.get<PermissionGuard>(PermissionGuard);
  });

  /**
   * Helper: bikin mock ExecutionContext
   */
  const mockContext = (
    user: any,
    permission: any,
    requestOverrides: Record<string, unknown> = {},
  ) => {
    reflector.get.mockReturnValue(permission);
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, ...requestOverrides }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  };

  it('should allow (true) when no @RequirePermission metadata', async () => {
    const ctx = mockContext({ persnum: 1 }, undefined);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when no user in request', async () => {
    const ctx = mockContext(null, {
      resource: 'naskah-dinas',
      action: 'create',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // SUPERADMIN tetap mengikuti permission role di database.
  it('should check SUPERADMIN permission from DB (activeRole.name)', async () => {
    permissionCache.get.mockReturnValue([
      { resource: 'role', actions: ['create'] },
    ]);
    const ctx = mockContext(
      { persnum: 1, activeRole: { name: 'SUPERADMIN' } },
      { resource: 'role', action: 'create' },
    );
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(permissionCache.get).toHaveBeenCalledWith(1);
  });

  it('should check SUPERADMIN permission from DB (legacy role field)', async () => {
    permissionCache.get.mockReturnValue([
      { resource: 'dashboard', actions: ['read'] },
    ]);
    const ctx = mockContext(
      { persnum: 1, role: 'superadmin' },
      { resource: 'dashboard', action: 'read' },
    );
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(permissionCache.get).toHaveBeenCalledWith(1);
  });

  it('should throw ForbiddenException when user has no persnum', async () => {
    const ctx = mockContext(
      { role: 'admin' },
      { resource: 'naskah-dinas', action: 'read' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should use cached permissions when available', async () => {
    const cachedPerms = [
      { resource: 'naskah-dinas', actions: ['read', 'create'] },
    ];
    permissionCache.get.mockReturnValue(cachedPerms);

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'naskah-dinas', action: 'read' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(permissionCache.get).toHaveBeenCalledWith(123);
    expect(rbacService.buildActiveRoleAndPermissions).not.toHaveBeenCalled();
  });

  it('should allow when user has required permission (DB query)', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [
        { resource: 'naskah-dinas', actions: ['read', 'create'] },
      ],
      activeRole: { id: 'r1', name: RoleName.ADMIN },
      roles: [{ id: 'r1', name: RoleName.ADMIN }],
      role: 'admin',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'admin' },
      { resource: 'naskah-dinas', action: 'create' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(rbacService.buildActiveRoleAndPermissions).toHaveBeenCalledWith(123);
    expect(permissionCache.set).toHaveBeenCalledWith(123, [
      { resource: 'naskah-dinas', actions: ['read', 'create'] },
    ]);
  });

  it('allows an explicitly permitted viewer status when the RBAC permission exists', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      PositionStatus.VI,
      PositionStatus.SE,
    ]);
    permissionCache.get.mockReturnValue([
      { resource: 'tugas', actions: ['read-board', 'create-board'] },
    ]);

    const ctx = mockContext(
      {
        persnum: 123,
        role: 'user',
        position_status: PositionStatus.SE,
      },
      { resource: 'tugas', action: 'create-board' },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows delegated SE to write TU notification actions', async () => {
    permissionCache.get.mockReturnValue([
      { resource: 'tu-verifikasi', actions: ['read', 'update'] },
    ]);

    const ctx = mockContext(
      {
        persnum: 123,
        role: 'user',
        position_status: PositionStatus.SE,
      },
      undefined,
      {
        method: 'PATCH',
        url: '/tu/notifikasi-usulan/transfer-id/ajukan-atasan-tu',
      },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should deny SDE Massal create when read is not assigned', async () => {
    permissionCache.get.mockReturnValue([
      { resource: 'sde-masal', actions: ['create'] },
    ]);

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'sde-masal', action: 'create' },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'sde-masal.read',
    );
  });

  it('should allow SDE Massal create when read is assigned', async () => {
    permissionCache.get.mockReturnValue([
      { resource: 'sde-masal', actions: ['read', 'create'] },
    ]);

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'sde-masal', action: 'create' },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should throw ForbiddenException when user lacks required permission', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [{ resource: 'naskah-dinas', actions: ['read'] }],
      activeRole: { id: 'r1', name: RoleName.USER },
      roles: [{ id: 'r1', name: RoleName.USER }],
      role: 'user',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'naskah-dinas', action: 'delete' }, // not in actions
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('naskah-dinas.delete');
  });

  it('should throw when user has no permissions at all', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [],
      activeRole: null,
      roles: [],
      role: 'user',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'naskah-dinas', action: 'read' },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should fallback to JWT activePermissions when DB query fails', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockRejectedValue(
      new Error('DB down'),
    );

    const jwtPerms = [{ resource: 'naskah-dinas', actions: ['read'] }];
    const ctx = mockContext(
      { persnum: 123, role: 'user', activePermissions: jwtPerms },
      { resource: 'naskah-dinas', action: 'read' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should throw when DB fails and JWT has no activePermissions', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockRejectedValue(
      new Error('DB down'),
    );

    const ctx = mockContext(
      { persnum: 123, role: 'user' }, // no activePermissions
      { resource: 'naskah-dinas', action: 'read' },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('B1 regression: should reflect DB change after cache invalidation', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValueOnce({
      activePermissions: [
        { resource: 'naskah-dinas', actions: ['create', 'read'] },
      ],
      activeRole: { id: 'r1', name: RoleName.USER },
      roles: [{ id: 'r1', name: RoleName.USER }],
      role: 'user',
    });

    const ctx1 = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'naskah-dinas', action: 'create' },
    );
    expect(await guard.canActivate(ctx1)).toBe(true);

    permissionCache.invalidate(123);
    permissionCache.get.mockReturnValue(null); // cache miss setelah invalidate

    rbacService.buildActiveRoleAndPermissions.mockResolvedValueOnce({
      activePermissions: [{ resource: 'naskah-dinas', actions: ['read'] }], // create dihapus
      activeRole: { id: 'r1', name: RoleName.USER },
      roles: [{ id: 'r1', name: RoleName.USER }],
      role: 'user',
    });

    const ctx2 = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'naskah-dinas', action: 'create' },
    );

    await expect(guard.canActivate(ctx2)).rejects.toThrow(ForbiddenException);
  });

  it('should allow ADMIN with master-data.create permission', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [
        {
          resource: 'master-data',
          actions: ['create', 'read', 'update', 'delete'],
        },
      ],
      activeRole: { id: 'r1', name: RoleName.ADMIN },
      roles: [{ id: 'r1', name: RoleName.ADMIN }],
      role: 'admin',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'admin' },
      { resource: 'master-data', action: 'create' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should deny USER without master-data.create (only has read)', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [{ resource: 'master-data', actions: ['read'] }],
      activeRole: { id: 'r1', name: RoleName.USER },
      roles: [{ id: 'r1', name: RoleName.USER }],
      role: 'user',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'master-data', action: 'create' },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('master-data.create');
  });

  it('should allow ADMIN with konfigurasi.update permission', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [
        { resource: 'konfigurasi', actions: ['read', 'update'] },
      ],
      activeRole: { id: 'r1', name: RoleName.ADMIN },
      roles: [{ id: 'r1', name: RoleName.ADMIN }],
      role: 'admin',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'admin' },
      { resource: 'konfigurasi', action: 'update' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should allow USER with delegasi.read permission', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [{ resource: 'delegasi', actions: ['read'] }],
      activeRole: { id: 'r1', name: RoleName.USER },
      roles: [{ id: 'r1', name: RoleName.USER }],
      role: 'user',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'delegasi', action: 'read' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should deny USER delegasi.create (only has read)', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [{ resource: 'delegasi', actions: ['read'] }],
      activeRole: { id: 'r1', name: RoleName.USER },
      roles: [{ id: 'r1', name: RoleName.USER }],
      role: 'user',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'delegasi', action: 'create' },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should allow ADMIN with laporan.export permission', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [{ resource: 'laporan', actions: ['read', 'export'] }],
      activeRole: { id: 'r1', name: RoleName.ADMIN },
      roles: [{ id: 'r1', name: RoleName.ADMIN }],
      role: 'admin',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'admin' },
      { resource: 'laporan', action: 'export' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should deny USER laporan.export (only has read)', async () => {
    permissionCache.get.mockReturnValue(null);
    rbacService.buildActiveRoleAndPermissions.mockResolvedValue({
      activePermissions: [{ resource: 'laporan', actions: ['read'] }],
      activeRole: { id: 'r1', name: RoleName.USER },
      roles: [{ id: 'r1', name: RoleName.USER }],
      role: 'user',
    });

    const ctx = mockContext(
      { persnum: 123, role: 'user' },
      { resource: 'laporan', action: 'export' },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
