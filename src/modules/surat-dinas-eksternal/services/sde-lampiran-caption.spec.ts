import { SuratDinasEksternalService } from './surat-dinas-eksternal.service';

describe('SDE attachment caption in PDF preview', () => {
  it.each([
    ['Berkas pendukung kegiatan', false, 'Berkas pendukung kegiatan'],
    ['Supporting documents', true, 'Supporting documents'],
    ['-', false, '2 Lampiran'],
    ['-', true, '2 Attachments'],
  ])(
    'preserves caption %s with temporary and direct attachments',
    async (caption, english, expected) => {
      const generatePdf = jest.fn().mockResolvedValue(Buffer.from('pdf'));
      const service = Object.assign(
        Object.create(SuratDinasEksternalService.prototype),
        {
          generatePdfSudinService: { generatePdf },
          qrCodeService: {
            generatePreviewQRCodeHtml: jest.fn().mockResolvedValue('qr'),
          },
          getTemporaryLampiranFiles: jest
            .fn()
            .mockResolvedValue([
              { fileName: 'temp.pdf', filePath: 'temp-key' },
            ]),
          mergePdfWithTemporaryFiles: jest
            .fn()
            .mockResolvedValue(Buffer.from('merged')),
        },
      );
      const result = await service.generatePdfFromHtml(
        '<p>Konten</p>',
        ['Penerima'],
        'Tangerang',
        '6 Oktober 2026',
        'Direktur',
        'Nama',
        [],
        ['temp-id'],
        'Perihal',
        'Biasa',
        '',
        caption,
        undefined,
        english,
        '',
        [{ fileName: 'direct.pdf', key: 'direct-key' }],
      );
      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({ lampiran: expected }),
      );
      expect(service.mergePdfWithTemporaryFiles).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.arrayContaining([
          expect.objectContaining({ fileName: 'temp.pdf' }),
          expect.objectContaining({ fileName: 'direct.pdf' }),
        ]),
      );
      expect(result.toString()).toBe('merged');
    },
  );
});
