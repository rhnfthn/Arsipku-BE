import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { NaskahTypeEnum } from '../dto/generate-draft.dto';

const makeCtx = (persnum: number | undefined, naskahType?: NaskahTypeEnum) => ({
  switchToHttp: () => ({
    getRequest: () => ({
      user: persnum ? { persnum } : undefined,
      body: naskahType ? { naskahType } : undefined,
    }),
  }),
});

describe('AiRateLimitGuard', () => {
  const makeConfig = (limit: string) => ({
    get: (k: string) => (k === 'AI_RATE_LIMIT_DAILY' ? limit : undefined),
  });
  const makeRbac = (allowed: boolean) => ({
    buildActiveRoleAndPermissions: jest.fn().mockResolvedValue({
      activePermissions: allowed
        ? [{ resource: 'utama.tulis.nota-dinas', actions: ['generate-ai'] }]
        : [],
    }),
  });

  it('allows when under limit', async () => {
    const log: any = { countTodaySuccess: jest.fn().mockResolvedValue(3) };
    const guard = new AiRateLimitGuard(
      log,
      makeConfig('10') as any,
      makeRbac(true) as any,
    );
    await expect(guard.canActivate(makeCtx(1) as any)).resolves.toBe(true);
  });

  it('throws 429 when at limit', async () => {
    const log: any = { countTodaySuccess: jest.fn().mockResolvedValue(10) };
    const guard = new AiRateLimitGuard(
      log,
      makeConfig('10') as any,
      makeRbac(true) as any,
    );
    await expect(guard.canActivate(makeCtx(1) as any)).rejects.toMatchObject({
      message: expect.stringContaining('Kuota'),
    });
  });

  it('allows when user missing (let auth guard handle)', async () => {
    const log: any = { countTodaySuccess: jest.fn() };
    const guard = new AiRateLimitGuard(
      log,
      makeConfig('10') as any,
      makeRbac(true) as any,
    );
    await expect(guard.canActivate(makeCtx(undefined) as any)).resolves.toBe(
      true,
    );
    expect(log.countTodaySuccess).not.toHaveBeenCalled();
  });

  it('throws 403 when generate-ai permission missing', async () => {
    const log: any = { countTodaySuccess: jest.fn().mockResolvedValue(0) };
    const guard = new AiRateLimitGuard(
      log,
      makeConfig('10') as any,
      makeRbac(false) as any,
    );
    await expect(
      guard.canActivate(makeCtx(1, NaskahTypeEnum.ND) as any),
    ).rejects.toMatchObject({
      message: expect.stringContaining('tidak memiliki izin'),
    });
  });

  it('allows when generate-ai permission present', async () => {
    const log: any = { countTodaySuccess: jest.fn().mockResolvedValue(0) };
    const guard = new AiRateLimitGuard(
      log,
      makeConfig('10') as any,
      makeRbac(true) as any,
    );
    await expect(
      guard.canActivate(makeCtx(1, NaskahTypeEnum.ND) as any),
    ).resolves.toBe(true);
  });
});
