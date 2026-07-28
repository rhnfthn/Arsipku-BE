import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PemeliharaanAccessGuard } from './pemeliharaan-access.guard';
import { PemeliharaanAccess } from '../helpers/pemeliharaan-access.helper';

describe('PemeliharaanAccessGuard', () => {
  let guard: PemeliharaanAccessGuard;
  let getAllAndOverride: jest.Mock;

  beforeEach(() => {
    getAllAndOverride = jest.fn();
    guard = new PemeliharaanAccessGuard({ getAllAndOverride } as any);
  });

  const ctx = (user: any, required: PemeliharaanAccess[] | undefined) => {
    getAllAndOverride.mockReturnValue(required);
    const req = { user };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('lolos jika route tanpa @PemeliharaanAccess (metadata kosong)', () => {
    expect(guard.canActivate(ctx({ persnum: 1, bodTag: '' }, undefined))).toBe(true);
  });

  it('lolos jika effective role termasuk required', () => {
    expect(guard.canActivate(ctx({ persnum: 1, bodTag: '' }, ['pemberkasan']))).toBe(true);
    expect(guard.canActivate(ctx({ persnum: 2, bodTag: 'BOD' }, ['persetujuan']))).toBe(true);
    expect(guard.canActivate(ctx({ persnum: 3, bodTag: '' }, ['pemberkasan', 'persetujuan']))).toBe(true);
  });

  it('tolak jika effective role tidak termasuk required', () => {
    // non-managerial (pemberkasan) mencoba akses persetujuan
    expect(() => guard.canActivate(ctx({ persnum: 1, bodTag: '' }, ['persetujuan']))).toThrow(ForbiddenException);
    // managerial (persetujuan) mencoba akses pemberkasan
    expect(() => guard.canActivate(ctx({ persnum: 2, bodTag: 'BOD' }, ['pemberkasan']))).toThrow(ForbiddenException);
  });

  it('lolos untuk SE pada required pemberkasan', () => {
    expect(guard.canActivate(ctx({ persnum: 1, position_status: 'SE', bodTag: 'BOD' }, ['pemberkasan']))).toBe(true);
  });

  it('tolak untuk SE pada required persetujuan', () => {
    expect(() => guard.canActivate(ctx({ persnum: 1, position_status: 'SE', bodTag: 'BOD' }, ['persetujuan']))).toThrow(ForbiddenException);
  });

  it('VI (effective null) ditolak untuk semua required', () => {
    expect(() => guard.canActivate(ctx({ persnum: 1, position_status: 'VI', bodTag: 'BOD' }, ['pemberkasan']))).toThrow(ForbiddenException);
  });

  it('ADMIN/SUPERADMIN bypass', () => {
    expect(guard.canActivate(ctx({ persnum: 1, activeRole: { name: 'SUPERADMIN' }, bodTag: '' }, ['persetujuan']))).toBe(true);
    expect(guard.canActivate(ctx({ persnum: 1, role: 'admin', bodTag: '' }, ['persetujuan']))).toBe(true);
  });

  it('tolak jika user tidak terautentikasi', () => {
    expect(() => guard.canActivate(ctx(undefined, ['pemberkasan']))).toThrow(ForbiddenException);
  });
});
