import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { PositionStatus } from '../../common/enums/position-status.enum';

describe('PermissionGuard — viewer-write exemption (@AllowViewerWrite)', () => {
  let guard: PermissionGuard;
  let reflector: any;
  const rbacService: any = {
    buildActiveRoleAndPermissions: jest.fn(async () => ({ activePermissions: [], activeRole: null, roles: [], role: 'user' })),
  };
  const permissionCache: any = { get: jest.fn(() => undefined), set: jest.fn(), cleanupExpired: jest.fn() };

  beforeEach(() => {
    reflector = { get: jest.fn(() => undefined), getAllAndOverride: jest.fn(() => undefined) };
    guard = new PermissionGuard(reflector, rbacService, permissionCache);
  });

  const ctx = (opts: { user: any; allow?: string[]; method?: string; url?: string }) => {
    reflector.get = jest.fn(() => undefined); // no @RequirePermission -> early return after blockViewerWrite
    reflector.getAllAndOverride = jest.fn(() => opts.allow ?? undefined);
    const req = { user: opts.user, method: opts.method ?? 'POST', url: opts.url ?? '/arsip-dinamis/berkas' };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('SE + POST + @AllowViewerWrite(SE) → lolos (pemberkasan write)', () => {
    expect(guard.canActivate(ctx({ user: { persnum: 1, position_status: PositionStatus.SE }, allow: [PositionStatus.SE] }))).resolves.toBe(true);
  });

  it('VI + POST + @AllowViewerWrite(SE) → diblok (VI tidak di-allowlist)', () => {
    expect(guard.canActivate(ctx({ user: { persnum: 1, position_status: PositionStatus.VI }, allow: [PositionStatus.SE] }))).rejects.toThrow(ForbiddenException);
  });

  it('SE + POST tanpa @AllowViewerWrite → diblok', () => {
    expect(guard.canActivate(ctx({ user: { persnum: 1, position_status: PositionStatus.SE }, allow: undefined }))).rejects.toThrow(ForbiddenException);
  });

  it('SE + GET (non-write) → lolos tanpa decorator', () => {
    expect(guard.canActivate(ctx({ user: { persnum: 1, position_status: PositionStatus.SE }, method: 'GET' }))).resolves.toBe(true);
  });
});
