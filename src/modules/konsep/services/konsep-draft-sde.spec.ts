import { KonsepService } from './konsep.service';

describe('KonsepService SDE draft form parsing', () => {
  it('keeps editable SDI attachment text separate from file IDs', async () => {
    const service = Object.create(KonsepService.prototype) as KonsepService;
    (service as any).uploadDeprecatedLampiranFilesAsTemporary = jest
      .fn()
      .mockResolvedValue([]);
    const dto = await service.parseFormDataToCreateDraftDto({
      jenis: 'SDI',
      from_position_id: '101',
      lampiran_text: 'Dua berkas pendukung',
      lampiran_temp_ids: '["file-1","file-2"]',
    });
    expect(dto.lampiran_text).toBe('Dua berkas pendukung');
    expect(dto.lampiran_temp_ids).toEqual(['file-1', 'file-2']);
  });

  it('keeps external recipients, internal copies, and authority-line metadata', async () => {
    const service = Object.create(KonsepService.prototype) as KonsepService;
    (service as any).uploadDeprecatedLampiranFilesAsTemporary = jest
      .fn()
      .mockResolvedValue([]);

    const dto = await service.parseFormDataToCreateDraftDto({
      jenis: 'SDE',
      from_position_id: '101',
      penerima_ids: JSON.stringify(['external-1', 'external-2']),
      tembusan_position_ids: JSON.stringify(['201', '202']),
      atas_nama: 'Direktur Utama',
      atas_nama_position_id: '301',
      english: 'true',
    });

    expect(dto).toMatchObject({
      penerima_eksternal: ['external-1', 'external-2'],
      tembusan_position_ids: [201, 202],
      atas_nama: 'Direktur Utama',
      atas_nama_position_id: 301,
      english: true,
    });
  });

  it('keeps explicit authority-line clearing during draft update', async () => {
    const service = Object.create(KonsepService.prototype) as KonsepService;
    (service as any).uploadDeprecatedLampiranFilesAsTemporary = jest
      .fn()
      .mockResolvedValue([]);

    const dto = await service.parseFormDataToUpdateDraftDto({
      jenis: 'SDE',
      from_position_id: '101',
      atas_nama: '',
      atas_nama_position_id: '',
    });

    expect(dto.atas_nama).toBeNull();
    expect(dto.atas_nama_position_id).toBeNull();
  });
});
