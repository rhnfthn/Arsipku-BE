import { DataSource } from 'typeorm';
import { TteSigningService } from './tte-signing.service';
import { TtePendingCorrespondenceWorker } from './tte-pending-correspondence.worker';

describe('Pending TTE background reconciliation', () => {
  it('does not overlap runs and rotates past the first page', async () => {
    let release: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      createdAt: new Date(0),
      userPersnum: 1,
    }));
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValue([]),
    };
    const dataSource = {
      getRepository: () => ({ createQueryBuilder: () => query }),
    } as unknown as DataSource;
    const signing = {
      getTransactionStatus: jest
        .fn()
        .mockImplementationOnce(() => blocker)
        .mockResolvedValue(undefined),
    };
    const worker = new TtePendingCorrespondenceWorker(
      dataSource,
      signing as unknown as TteSigningService,
    );
    const first = worker.reconcilePending();
    await new Promise((resolve) => setImmediate(resolve));
    await worker.reconcilePending();
    expect(query.getMany).toHaveBeenCalledTimes(1);
    release!();
    await first;
    expect(signing.getTransactionStatus).toHaveBeenCalledTimes(10);
    await worker.reconcilePending();
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('cursorTime'),
      { cursorTime: new Date(0), cursorId: '9' },
    );
  });
});
