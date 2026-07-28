import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { PositionStatus } from '../../common/enums/position-status.enum';

describe('PermissionGuard — delegasi enforcement (effective persnum + VI/SE strip)', () => {
  let guard: PermissionGuard;
  let reflector: any;
  let rbacService: any;
  let permissionCache: any;
  const permsByPersnum: Record<
    number,
    { resource: string; actions: string[] }[]
  > = {};

  beforeEach(() => {
    reflector = { get: jest.fn(() => undefined), getAllAndOverride: jest.fn(() => undefined) };
    rbacService = {
      buildActiveRoleAndPermissions: jest.fn(async (persnum: number) => ({
        activePermissions: permsByPersnum[persnum] ?? [],
        activeRole: null,
        roles: [],
        role: 'user' as const,
      })),
    };
    permissionCache = {
      get: jest.fn(() => undefined), // always miss -> exercise rbacService
      set: jest.fn(),
      cleanupExpired: jest.fn(),
    };
    guard = new PermissionGuard(reflector, rbacService, permissionCache);
    for (const k of Object.keys(permsByPersnum))
      delete permsByPersnum[Number(k)];
  });

  const ctx = (opts: {
    user: any;
    permission?: any;
    method?: string;
    url?: string;
  }) => {
    reflector.get = jest.fn(() => opts.permission ?? undefined);
    const req = {
      user: opts.user,
      method: opts.method ?? 'GET',
      url: opts.url ?? '/x',
    };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  const setPerms = (
    persnum: number,
    perms: { resource: string; actions: string[] }[],
  ) => {
    permsByPersnum[persnum] = perms;
  };

  const ND_CREATE = { resource: 'naskah-dinas', action: 'create' };
  const ND_READ = { resource: 'naskah-dinas', action: 'read' };

  it('YBS (no position_status): uses own persnum — create allowed when own has it', async () => {
    setPerms(1, [{ resource: 'naskah-dinas', actions: ['create'] }]);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: null,
      delegator_persnum: null,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).resolves.toBe(true);
  });

  it('PT: inherits delegator create (delegator persnum 2 has it, own has none)', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create'] }]); // delegator
    setPerms(1, []); // own — empty proves delegator was used
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.PT,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).resolves.toBe(true);
  });

  it('PT: delegator lacks create -> Forbidden', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['read'] }]);
    setPerms(1, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.PT,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('PH: inherits delegator create (mirrors PT)', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create'] }]);
    setPerms(1, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.PH,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).resolves.toBe(true);
  });

  it('PS: inherits delegator create (mirrors PT)', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create'] }]);
    setPerms(1, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.PS,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).resolves.toBe(true);
  });

  it('VI: write stripped even though delegator has create -> Forbidden', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create', 'read'] }]);
    setPerms(1, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('VI: read allowed (read survives strip)', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create', 'read'] }]);
    setPerms(1, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_READ })),
    ).resolves.toBe(true);
  });

  it('SUPERADMIN bypass unchanged — tied to delegate own role (not delegator)', async () => {
    // delegate is themselves SUPERADMIN acting as PT; bypass applies even though delegator has no perms
    setPerms(2, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'SUPERADMIN' },
      position_status: PositionStatus.PT,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).resolves.toBe(true);
  });

  it('PT into superadmin delegator (delegate is USER): no bypass, inherits all -> allowed', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create'] }]); // delegator(superadmin) enumerated
    setPerms(1, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.PT,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(ctx({ user, permission: ND_CREATE })),
    ).resolves.toBe(true);
  });

  const POST = 'POST';
  const NO_PERM = undefined; // un-guarded endpoint

  it('VI: un-guarded POST /naskah-dinas/send-message -> Forbidden (method-block)', async () => {
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create'] }]);
    await expect(
      guard.canActivate(
        ctx({
          user,
          permission: NO_PERM,
          method: POST,
          url: '/naskah-dinas/send-message',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('VI: allow-list POST /notification/mark-read -> allowed (no @RequirePermission)', async () => {
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({
          user,
          permission: NO_PERM,
          method: POST,
          url: '/notification/mark-read',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('VI: POST /label -> Forbidden (label blocked, not in allow-list)', async () => {
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({ user, permission: NO_PERM, method: POST, url: '/label' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('VI: exact POST /delegasi/switch-role -> allowed (escape route)', async () => {
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({
          user,
          permission: NO_PERM,
          method: POST,
          url: '/delegasi/switch-role',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('VI: POST /delegasi (create delegasi, NOT switch-role) -> Forbidden', async () => {
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({ user, permission: NO_PERM, method: POST, url: '/delegasi' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('YBS: POST /naskah-dinas/send-message NOT blocked (method-block only VI/SE)', async () => {
    setPerms(1, [{ resource: 'naskah-dinas', actions: ['create'] }]);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: null,
      delegator_persnum: null,
    };
    await expect(
      guard.canActivate(
        ctx({
          user,
          permission: NO_PERM,
          method: POST,
          url: '/naskah-dinas/send-message',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('SE: un-guarded POST -> Forbidden (mirrors VI)', async () => {
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.SE,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({ user, permission: NO_PERM, method: POST, url: '/kajian' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // delegasi control plane uses the delegate's OWN perms (no inheritance, no VI/SE strip)
  it('VI delegate: delegasi.create (switch-role) passes via OWN persnum (not stripped, not delegator)', async () => {
    // delegate's own persnum 1 has delegasi.create; delegator persnum 2 has NONE.
    setPerms(1, [{ resource: 'delegasi', actions: ['create', 'read'] }]);
    setPerms(2, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({ user, permission: { resource: 'delegasi', action: 'create' } }),
      ),
    ).resolves.toBe(true);
  });

  it('PT delegate: delegasi.create passes via OWN persnum even when delegator lacks it', async () => {
    setPerms(1, [{ resource: 'delegasi', actions: ['create'] }]);
    setPerms(2, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.PT,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({ user, permission: { resource: 'delegasi', action: 'create' } }),
      ),
    ).resolves.toBe(true);
  });

  it('regression: VI delegate still stripped on BUSINESS resource (naskah-dinas.create) -> Forbidden', async () => {
    setPerms(2, [{ resource: 'naskah-dinas', actions: ['create', 'read'] }]);
    setPerms(1, []);
    const user = {
      persnum: 1,
      activeRole: { name: 'USER' },
      position_status: PositionStatus.VI,
      delegator_persnum: 2,
    };
    await expect(
      guard.canActivate(
        ctx({
          user,
          permission: { resource: 'naskah-dinas', action: 'create' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
