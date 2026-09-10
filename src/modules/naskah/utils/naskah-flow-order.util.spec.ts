import { compareNaskahFlow } from './naskah-flow-order.util';

describe('compareNaskahFlow', () => {
  it('orders konsep by its sequence and puts the final document last', () => {
    const flow = [
      { jenis: 'ND', nomor: '090/TT/HUK.03/IX/2026', level: 0 },
      { jenis: 'K', nomor: 'KONSEP-002', level: 0 },
      { jenis: 'K', nomor: 'KONSEP-003', level: 0 },
      { jenis: 'K', nomor: 'KONSEP-001', level: 0 },
    ];

    expect(flow.sort(compareNaskahFlow).map((item) => item.nomor)).toEqual([
      'KONSEP-001',
      'KONSEP-002',
      'KONSEP-003',
      '090/TT/HUK.03/IX/2026',
    ]);
  });

  it('uses the concept number even when every item has the same date', () => {
    const flow = [3, 1, 2].map((sequence) => ({
      jenis: 'K',
      nomor: `KONSEP-${String(sequence).padStart(3, '0')}`,
      level: 0,
      tanggal: '2026-09-09',
    }));

    expect(flow.sort(compareNaskahFlow).map((item) => item.nomor)).toEqual([
      'KONSEP-001',
      'KONSEP-002',
      'KONSEP-003',
    ]);
  });

  it('orders a disposition, concept workflow, and finalized document as one chronological chain', () => {
    const flow = [
      {
        jenis: 'KN',
        nomor: '090/TT/HUK.03/IX/2026',
        level: 2,
        tanggal: '2026-09-09',
      },
      {
        jenis: 'K',
        nomor: 'KONSEP-002',
        level: 2,
        created_at: '2026-09-09T04:25:12.000Z',
      },
      {
        jenis: 'DI',
        nomor: 'TTEI.013',
        level: 1,
        created_at: '2026-09-09T04:20:00.000Z',
      },
      {
        jenis: 'DI',
        nomor: 'TTEI.012',
        level: 0,
        created_at: '2026-09-09T04:10:00.000Z',
      },
      {
        jenis: 'K',
        nomor: 'KONSEP-001',
        level: 2,
        created_at: '2026-09-09T04:24:12.000Z',
      },
    ];

    expect(flow.sort(compareNaskahFlow).map((item) => item.nomor)).toEqual([
      'TTEI.012',
      'TTEI.013',
      'KONSEP-001',
      'KONSEP-002',
      '090/TT/HUK.03/IX/2026',
    ]);
  });
});
