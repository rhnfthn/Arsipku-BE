import { EntityManager } from 'typeorm';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import {
  toMysqlDate,
  updatePartitionedNaskah,
} from './naskah-partition.helper';

describe('naskah partition helper', () => {
  const createManager = (affected = 1) => {
    const query = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue({ affected });
    return {
      manager: { query, update } as unknown as EntityManager,
      query,
      update,
    };
  };

  it('normalizes DATE values without an UTC date shift', () => {
    expect(toMysqlDate('2026-09-03T23:59:59.000Z')).toBe('2026-09-03');
    expect(toMysqlDate(new Date(2026, 8, 3, 23, 59, 59))).toBe('2026-09-03');
  });

  it('updates an existing row by its complete composite key', async () => {
    const { manager, query, update } = createManager();

    await updatePartitionedNaskah(
      manager,
      NaskahEntity,
      { id: 'naskah-1', tanggal: '2026-09-03' },
      { status: 'final' },
    );

    expect(query).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      NaskahEntity,
      { id: 'naskah-1', tanggal: '2026-09-03' },
      { status: 'final' },
    );
  });

  it('moves every denormalized child partition date in the same operation', async () => {
    const { manager, query } = createManager();

    await updatePartitionedNaskah(
      manager,
      NaskahEntity,
      { id: 'naskah-1', tanggal: '2026-09-02' },
      { tanggal: '2026-09-03' },
    );

    expect(query).toHaveBeenCalledTimes(4);
    for (const table of [
      'naskah_sirkulasi',
      'naskah_lampiran',
      'naskah_referensi',
      'di',
    ]) {
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(`UPDATE \`${table}\``),
        ['2026-09-03', 'naskah-1', '2026-09-02'],
      );
    }
  });

  it('fails instead of silently inserting or updating the wrong row', async () => {
    const { manager } = createManager(0);

    await expect(
      updatePartitionedNaskah(
        manager,
        NaskahEntity,
        { id: 'missing', tanggal: '2026-09-03' },
        { status: 'final' },
      ),
    ).rejects.toThrow('tidak ditemukan atau tidak unik');
  });
});
