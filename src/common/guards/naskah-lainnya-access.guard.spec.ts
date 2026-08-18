import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { NaskahLainnyaAccessGuard } from './naskah-lainnya-access.guard';
import { PositionStatus } from '../enums/position-status.enum';

describe('NaskahLainnyaAccessGuard', () => {
  const guard = new NaskahLainnyaAccessGuard();

  const ctx = (user: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext);

  it('SE/VI/EXT → 403', () => {
    expect(() => guard.canActivate(ctx({ position_status: PositionStatus.SE }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ position_status: PositionStatus.VI }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ position_status: PositionStatus.EXT }))).toThrow(ForbiddenException);
  });

  it('YBS/PT/PH/PS → true', () => {
    expect(guard.canActivate(ctx({ position_status: PositionStatus.YBS }))).toBe(true);
    expect(guard.canActivate(ctx({ position_status: PositionStatus.PT }))).toBe(true);
    expect(guard.canActivate(ctx({ position_status: PositionStatus.PH }))).toBe(true);
    expect(guard.canActivate(ctx({ position_status: PositionStatus.PS }))).toBe(true);
  });

  it('null/undefined position_status → true (no delegation)', () => {
    expect(guard.canActivate(ctx({ position_status: null }))).toBe(true);
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it('ADMIN/SUPERADMIN bypass walau position_status blocked', () => {
    expect(guard.canActivate(ctx({ activeRole: { name: 'SUPERADMIN' }, position_status: PositionStatus.VI }))).toBe(true);
    expect(guard.canActivate(ctx({ role: 'admin', position_status: PositionStatus.SE }))).toBe(true);
  });

  it('tolak jika user tidak terautentikasi', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
