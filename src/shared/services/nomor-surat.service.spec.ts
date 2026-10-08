import { NomorSuratService } from './nomor-surat.service';

describe('peralihan nomor lokasi pusat ke TNG', () => {
  it('Kajian melanjutkan nomor lama /00/ dan nomor baru /TNG/ tanpa mengubah nomor terbit', async () => {
    const published = [
      { nomor: '008/UL/00/X/2026' },
      { nomor: '009/UL/TNG/X/2026' },
    ];
    const before = JSON.stringify(published);
    const query: any = {};
    for (const method of ['select', 'where', 'andWhere', 'orderBy', 'limit']) {
      query[method] = jest.fn().mockReturnValue(query);
    }
    query.getRawMany = jest.fn().mockResolvedValue(published);
    const repo: any = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const service = new NomorSuratService(repo);
    const result = await service.generateNomor({
      jenis: 'KA',
      positionText: 'EVP Legal',
      positionAbbreviation: 'UL',
      areaText: 'Kantor Pusat',
      tanggal: new Date(2026, 9, 7),
    });
    expect(result.nomor).toBe('010/UL/TNG/X/2026');
    expect(query.andWhere).toHaveBeenCalledWith(
      '(n.nomor LIKE :pattern OR n.nomor LIKE :legacyPattern)',
      { pattern: '%/UL/TNG/%/2026', legacyPattern: '%/UL/00/%/2026' },
    );
    expect(JSON.stringify(published)).toBe(before);
  });

  it.each([
    ['SDI', '001/UL/TNG/DS.00.02/X/2026'],
    ['SDE', '001/UL/TNG/LPPNPI/DS.00.02/X/2026'],
    ['ND', '001/UL/DS.00.02/X/2026'],
  ] as const)(
    '%s memakai format baru tanpa mengubah klasifikasi',
    async (jenis, expected) => {
      const query: any = {};
      for (const method of [
        'select',
        'where',
        'andWhere',
        'orderBy',
        'limit',
      ]) {
        query[method] = jest.fn().mockReturnValue(query);
      }
      query.getRawMany = jest.fn().mockResolvedValue([]);
      const service = new NomorSuratService({
        createQueryBuilder: () => query,
      } as any);
      expect(
        (
          await service.generateNomor({
            jenis,
            positionText: 'EVP Legal',
            positionAbbreviation: 'UL',
            areaText: 'Kantor Pusat',
            tanggal: new Date(2026, 9, 7),
            klasifikasi: 'DS.00.02',
          })
        ).nomor,
      ).toBe(expected);
    },
  );
});
