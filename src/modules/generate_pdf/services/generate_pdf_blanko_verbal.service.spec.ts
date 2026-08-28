import { GeneratePdfBlankoVerbalService } from './generate_pdf_blanko_verbal.service';
import { SheetPdfData } from './sheet-pdf.shared';

describe('GeneratePdfBlankoVerbalService.buildHtml', () => {
  let service: GeneratePdfBlankoVerbalService;
  const directors = (qr: string[] = []) => [
    {
      index: 1,
      nama: 'Andi',
      jabatan: 'DIREKTUR OPERASI',
      qrBase64: qr[0] ?? 'q1',
    },
    {
      index: 2,
      nama: 'Bina',
      jabatan: 'DIREKTUR TEKNIK',
      qrBase64: qr[1] ?? 'q2',
    },
    {
      index: 3,
      nama: 'Cika',
      jabatan: 'DIREKTUR KESELAMATAN',
      qrBase64: qr[2] ?? 'q3',
    },
  ];

  beforeEach(() => {
    service = new GeneratePdfBlankoVerbalService();
  });

  function data(verified: number[] = [], qr: string[] = []): SheetPdfData {
    return {
      tanggal: '2026-08-21',
      nomor: 'B-001',
      perihal: 'Perihal Blanko',
      diusulkanOleh: 'Citra',
      jabatanDiusulkan: 'Kepala Unit',
      legalDrafter: 'Drafter',
      legalDrafterJabatan: 'Legal Officer',
      legalChecker: 'Checker',
      legalCheckerJabatan: 'Kabag Hukum',
      klasifikasi: 'Penting',
      lampiran: '1 (satu) berkas',
      bodyHtml: '<p>Isi blanko.</p>',
      catatan: 'cat',
      directors: directors(qr),
      verifiedIndices: new Set(verified),
    };
  }

  it('memuat judul BLANKO VERBAL & header PERUM LPPNPI', () => {
    const html = service.buildHtml(data());
    expect(html).toContain('BLANKO VERBAL');
    expect(html).toContain('PERUSAHAAN UMUM (PERUM)');
  });

  it('memuat field terstruktur + slot legalDrafter/legalChecker', () => {
    const html = service.buildHtml(data());
    expect(html).toContain('21 Agustus 2026');
    expect(html).toContain('B-001');
    expect(html).toContain('Drafter');
    expect(html).toContain('Legal Officer');
    expect(html).toContain('Checker');
    expect(html).toContain('Kabag Hukum');
  });

  it('menyematkan bodyHtml (Isi) antara top & bottom table', () => {
    const html = service.buildHtml(data());
    expect(html).toContain('Isi blanko.');
    expect(html).toContain('class="body-content"');
  });

  it('memuat nama & jabatan setiap direksi', () => {
    const html = service.buildHtml(data());
    expect(html).toContain('ANDI');
    expect(html).toContain('DIREKTUR OPERASI');
    expect(html).toContain('CIKA');
    expect(html).toContain('DIREKTUR KESELAMATAN');
  });

  it('merender visual digsig HANYA untuk direksi yang verified', () => {
    const html = service.buildHtml(data([1, 3], ['QR1', 'QR2', 'QR3']));
    expect(html).toContain('class="visible-digsig');
    expect(html).toContain('Ditandatangani secara elektronik oleh');
    expect(html).toContain('ANDI');
    expect(html).toContain('CIKA');
    expect(html).not.toContain('data:image/png;base64,QR1');
    expect(html).not.toContain('data:image/png;base64,QR2');
    expect(html).not.toContain('data:image/png;base64,QR3');
  });

  it('tidak membocorkan chrome nota dinas', () => {
    expect(service.buildHtml(data())).not.toContain('NOTA');
    expect(service.buildHtml(data())).not.toContain('Kepada Yth');
  });
});
