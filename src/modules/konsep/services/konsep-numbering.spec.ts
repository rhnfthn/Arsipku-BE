import { KonsepService } from './konsep.service';

describe('KonsepService concept version numbering', () => {
  const createService = () =>
    Object.create(KonsepService.prototype) as KonsepService;

  it('does not count duplicate numbers created by reject circulation nodes', async () => {
    const service = createService();
    const queryRunner = {
      manager: {
        find: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'version-5', nomor: 'KONSEP-005' },
            { id: 'version-6', nomor: 'KONSEP-006' },
            { id: 'reject-6', nomor: 'KONSEP-006' },
          ])
          .mockResolvedValueOnce([{ idNaskahKonsep: 'reject-6' }]),
      },
    };

    const result = await (service as any).generateKonsepNomorSequential(
      'naskah-asli-id',
      queryRunner,
    );

    expect(result).toBe('KONSEP-007');
  });

  it('ignores malformed legacy concept numbers', async () => {
    const service = createService();
    const queryRunner = {
      manager: {
        find: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'version-3', nomor: 'KONSEP-003' },
            { id: 'legacy', nomor: 'konsep lama' },
            { id: 'empty', nomor: null },
          ])
          .mockResolvedValueOnce([]),
      },
    };

    const result = await (service as any).generateKonsepNomorSequential(
      'naskah-asli-id',
      queryRunner,
    );

    expect(result).toBe('KONSEP-004');
  });

  it('ignores reject nodes created by the previous numbering behavior', async () => {
    const service = createService();
    const queryRunner = {
      manager: {
        find: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'version-6', nomor: 'KONSEP-006' },
            { id: 'legacy-reject-7', nomor: 'KONSEP-007' },
          ])
          .mockResolvedValueOnce([{ idNaskahKonsep: 'legacy-reject-7' }]),
      },
    };

    const result = await (service as any).generateKonsepNomorSequential(
      'naskah-asli-id',
      queryRunner,
    );

    expect(result).toBe('KONSEP-007');
  });
});
