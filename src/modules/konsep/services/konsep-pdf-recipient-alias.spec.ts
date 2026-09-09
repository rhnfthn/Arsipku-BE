import { KonsepService } from './konsep.service';

describe('KonsepService PDF recipient aliases', () => {
  const createService = () => {
    const service = Object.create(KonsepService.prototype) as KonsepService;
    (service as any).qrCodeService = {
      generatePreviewQRCodeHtml: jest.fn().mockResolvedValue('<qr />'),
    };
    (service as any).convertPositionIdsToNames = jest.fn(
      async (ids: Array<string | number>) =>
        ids.map((id) => `Position ${String(id)}`),
    );
    (service as any).eksternalRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    return service;
  };

  it('uses ND position IDs when empty penerima aliases are supplied', async () => {
    const service = createService();

    const dto = await (service as any).buildPdfDto('ND', {
      konten: '<p>Isi</p>',
      penerima: [],
      tertuju: '[]',
      penerima_position_ids: JSON.stringify([1, 2, 3, 4, 5, 6]),
    });

    expect(dto.tertuju).toEqual([
      'Position 1',
      'Position 2',
      'Position 3',
      'Position 4',
      'Position 5',
      'Position 6',
    ]);
  });

  it('uses SDI tembusan position IDs when tembusan is an empty JSON array', async () => {
    const service = createService();

    const dto = await (service as any).buildPdfDto('SDI', {
      konten: '<p>Isi</p>',
      tembusan: '[]',
      tembusan_position_ids: JSON.stringify([11, 12, 13, 14, 15, 16]),
    });

    expect(dto.tembusan).toEqual([
      'Position 11',
      'Position 12',
      'Position 13',
      'Position 14',
      'Position 15',
      'Position 16',
    ]);
  });

  it('resolves SDE penerima_ids to external names in UI selection order', async () => {
    const service = createService();
    const externalIds = ['a', 'b', 'c', 'd', 'e', 'f'];
    (service as any).eksternalRepository.find = jest
      .fn()
      .mockResolvedValue(
        [...externalIds]
          .reverse()
          .map((id) => ({ id, nama: `External ${id.toUpperCase()}` })),
      );

    const dto = await (service as any).buildPdfDto('SDE', {
      konten: '<p>Isi</p>',
      penerima: [],
      penerima_ids: JSON.stringify(externalIds),
    });

    expect(dto.penerima).toEqual([
      'External A',
      'External B',
      'External C',
      'External D',
      'External E',
      'External F',
    ]);
  });
});
