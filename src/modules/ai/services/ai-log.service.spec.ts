import { AiLogService } from './ai-log.service';

describe('AiLogService', () => {
  let repo: any;
  let service: AiLogService;

  beforeEach(() => {
    repo = {
      insert: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ cnt: '3' }),
      })),
    };
    service = new AiLogService(repo);
  });

  it('log() inserts a row', async () => {
    await service.log({ persnum: 1, request_body_redacted: '{"brief":"x"}' });
    expect(repo.insert).toHaveBeenCalled();
    const arg = repo.insert.mock.calls[0][0];
    expect(arg.persnum).toBe(1);
  });

  it('log() redacts sensitive keys in request_body_redacted', async () => {
    await service.log({ persnum: 1, request_body_redacted: '{"api_key":"secret","brief":"x"}' });
    const arg = repo.insert.mock.calls[0][0];
    expect(arg.request_body_redacted).toContain('[REDACTED]');
    expect(arg.request_body_redacted).not.toContain('secret');
  });

  it('log() swallows insert errors', async () => {
    repo.insert.mockRejectedValue(new Error('db down'));
    await expect(service.log({ persnum: 1 })).resolves.toBeUndefined();
  });

  it('countTodaySuccess() returns a number from query builder', async () => {
    const n = await service.countTodaySuccess(1);
    expect(n).toBe(3);
  });
});
