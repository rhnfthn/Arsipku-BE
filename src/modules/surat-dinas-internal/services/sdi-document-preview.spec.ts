import { SuratDinasInternalService } from './surat-dinas-internal.service';

describe('SDI document preview', () => {
  it('prefers the city from sub_area_alamat over the organizational area', async () => {
    const generatePdf = jest.fn().mockResolvedValue(Buffer.from('pdf'));
    const service = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      { generatePdfSudinService: { generatePdf } },
    ) as SuratDinasInternalService;
    await service.generatePlainPdf(
      '<p>Konten</p>', ['Direktur Teknik'], 'Kantor Pusat',
      '6 Oktober 2026', '', '', [], '', 'Biasa', '', '-',
      { kantor: 'Kantor Pusat', gedung: 'AirNav', alamat: 'Alamat', kota: 'Tangerang' },
      '<span>QR</span>',
    );
    expect(generatePdf).toHaveBeenCalledWith(
      expect.objectContaining({ nama_tempat: 'Tangerang' }),
    );
  });

  it.each([
    ['Dua berkas pendukung', 'Dua berkas pendukung'],
    ['-', '2 Lampiran'],
  ])('preserves attachment caption %s while merging uploaded files', async (caption, expected) => {
    const plain = jest.fn().mockResolvedValue(Buffer.from('main'));
    const merge = jest.fn().mockResolvedValue(Buffer.from('merged'));
    const files = [{ id: 'file-1' }, { id: 'file-2' }];
    const service = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      {
        generatePlainPdf: plain,
        getTemporaryLampiranFiles: jest.fn().mockResolvedValue(files),
        mergePdfWithTemporaryFiles: merge,
      },
    ) as SuratDinasInternalService;
    const result = await service.generatePdfFromHtml(
      '<p>Konten</p>', ['Direktur Teknik'], 'Tangerang', '', '', '', [],
      ['file-1', 'file-2'], '', 'Biasa', '', caption,
    );
    expect(plain.mock.calls[0][10]).toBe(expected);
    expect(merge).toHaveBeenCalledWith(Buffer.from('main'), files);
    expect(result).toEqual(Buffer.from('merged'));
  });
});
