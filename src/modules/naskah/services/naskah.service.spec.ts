import { NaskahService } from './naskah.service';

describe('NaskahService.remove (app-layer cascade)', () => {
  it('deletes verifikator rows before removing the naskah, in one transaction', async () => {
    const naskah = { id: 'n1', tanggal: new Date('2026-01-01') };
    const verifikatorDelete = jest.fn().mockResolvedValue(undefined);
    const removeNaskah = jest.fn().mockResolvedValue(undefined);
    const manager = { query: verifikatorDelete, remove: removeNaskah } as any;
    const transaction = jest.fn(async (cb: (m: any) => Promise<void>) => cb(manager));
    const naskahFindOne = jest.fn().mockResolvedValue(naskah);
    const deleteNaskah = jest.fn().mockResolvedValue(undefined);

    const service = new NaskahService(
      { findOne: naskahFindOne, remove: jest.fn().mockResolvedValue(undefined) } as any, // naskahRepository
      {} as any, {} as any, {} as any, {} as any, // sirkulasi/lampiran/referensi/di repos
      {} as any, // storageService
      { deleteNaskah } as any, // meilisearchSyncService
      {} as any, // grupPenerimaService
      {} as any, // notificationService
      { transaction } as any, // dataSource
    );

    await service.remove('n1');

    expect(verifikatorDelete).toHaveBeenCalledWith(
      'DELETE FROM naskah_dinas_verifikator WHERE id_naskah = ?',
      ['n1'],
    );
    expect(removeNaskah).toHaveBeenCalledWith(naskah);
    expect(removeNaskah).toHaveBeenCalledTimes(1);
    expect(verifikatorDelete.mock.invocationCallOrder[0]).toBeLessThan(
      removeNaskah.mock.invocationCallOrder[0],
    );
    expect(deleteNaskah).toHaveBeenCalledWith('n1');
  });
});
describe('NaskahService.create (PK komposit tanggal)', () => {
  const buildService = (save: jest.Mock) =>
    new NaskahService(
      { save } as any, // naskahRepository
      {} as any, {} as any, {} as any, {} as any, // sirkulasi/lampiran/referensi/di repos
      {} as any, // storageService
      { syncNaskah: jest.fn().mockResolvedValue(undefined) } as any, // meilisearchSyncService
      {} as any, // grupPenerimaService
      {} as any, // notificationService
      {} as any, // dataSource
    );

  it('mengisi tanggal default hari ini saat DTO tidak menyertakan tanggal', async () => {
    const save = jest.fn(async (n: any) => n);
    const service = buildService(save);

    const result = await service.create({ jenis: 'ND' } as any);

    expect(result.tanggal).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('memakai tanggal dari DTO saat disertakan', async () => {
    const save = jest.fn(async (n: any) => n);
    const service = buildService(save);
    const tgl = new Date('2026-01-15');

    const result = await service.create({ jenis: 'ND', tanggal: tgl } as any);

    expect(result.tanggal).toBe(tgl);
  });
});
