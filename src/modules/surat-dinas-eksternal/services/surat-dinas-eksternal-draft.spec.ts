import { SuratDinasEksternalService } from './surat-dinas-eksternal.service';

describe('SuratDinasEksternalService draft form parsing', () => {
  it('keeps recipients, copies, and authority-line metadata', async () => {
    const service = Object.create(
      SuratDinasEksternalService.prototype,
    ) as SuratDinasEksternalService;

    const dto = await service.parseFormDataToCreateDto({
      pengirim: '101',
      penerima: JSON.stringify(['external-1', 'external-2']),
      tembusan: JSON.stringify(['201', '202']),
      atas_nama: 'Direktur Utama',
      atas_nama_position_id: '301',
    });

    expect(dto).toMatchObject({
      pengirim: 101,
      penerima: ['external-1', 'external-2'],
      tembusan: [201, 202],
      atas_nama: 'Direktur Utama',
      atas_nama_position_id: 301,
    });
  });

  it('keeps explicit authority-line clearing during draft update', async () => {
    const service = Object.create(
      SuratDinasEksternalService.prototype,
    ) as SuratDinasEksternalService;

    const dto = await service.parseFormDataToCreateDto({
      pengirim: '101',
      penerima: JSON.stringify(['external-1']),
      atas_nama: '',
      atas_nama_position_id: '',
    });

    expect(dto.atas_nama).toBeNull();
    expect(dto.atas_nama_position_id).toBeNull();
  });
});
