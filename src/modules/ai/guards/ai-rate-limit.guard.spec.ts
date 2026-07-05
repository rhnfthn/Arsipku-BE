import { AiRateLimitGuard } from './ai-rate-limit.guard';

const makeCtx = (persnum: number | undefined) => ({
  switchToHttp: () => ({ getRequest: () => ({ user: persnum ? { persnum } : undefined }) }),
});

describe('AiRateLimitGuard', () => {
  const makeConfig = (limit: string) => ({ get: (k: string) => (k === 'AI_RATE_LIMIT_DAILY' ? limit : undefined) });

  it('allows when under limit', async () => {
    const log: any = { countTodaySuccess: jest.fn().mockResolvedValue(3) };
    const guard = new AiRateLimitGuard(log, makeConfig('10') as any);
    await expect(guard.canActivate(makeCtx(1) as any)).resolves.toBe(true);
  });

  it('throws 429 when at limit', async () => {
    const log: any = { countTodaySuccess: jest.fn().mockResolvedValue(10) };
    const guard = new AiRateLimitGuard(log, makeConfig('10') as any);
    await expect(guard.canActivate(makeCtx(1) as any)).rejects.toMatchObject({ message: expect.stringContaining('Kuota') });
  });

  it('allows when user missing (let auth guard handle)', async () => {
    const log: any = { countTodaySuccess: jest.fn() };
    const guard = new AiRateLimitGuard(log, makeConfig('10') as any);
    await expect(guard.canActivate(makeCtx(undefined) as any)).resolves.toBe(true);
    expect(log.countTodaySuccess).not.toHaveBeenCalled();
  });
});
