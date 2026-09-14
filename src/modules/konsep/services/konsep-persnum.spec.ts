import { KonsepService } from './konsep.service';

describe('KonsepService riwayat persnum response', () => {
  it('returns sender and recipient persnum from workflow snapshots', async () => {
    const service = Object.create(KonsepService.prototype) as KonsepService;
    (service as any).naskahRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'konsep-1',
        jenis: 'K',
        perihal: 'Perihal konsep',
        status: 'draft',
      }),
    };
    (service as any).konsepRiwayatRepository = {
      find: jest.fn().mockResolvedValue([
        {
          urutan: 1,
          fromPositionId: 101,
          fromPositionText: 'Konseptor',
          fromNama: 'User A',
          toPositionId: 202,
          toPositionText: 'Reviewer',
          toNama: 'User B',
          aksi: 'forward',
          catatan: null,
          pdfSnapshot: null,
          createdAt: new Date('2026-09-11T07:00:00.000Z'),
          createdBy: '10000001',
        },
      ]),
    };
    (service as any).naskahSirkulasiRepository = {
      find: jest.fn().mockResolvedValue([
        {
          idNaskah: 'konsep-1',
          position: '202',
          idSirkuler: '10000002',
        },
      ]),
    };
    (service as any).storageService = {
      getFileUrl: jest.fn(),
    };

    const result = await service.getRiwayat('konsep-1');

    expect(result.data.riwayat[0]).toMatchObject({
      from: { position_id: 101, persnum: '10000001' },
      to: { position_id: 202, persnum: '10000002' },
    });
  });
});
