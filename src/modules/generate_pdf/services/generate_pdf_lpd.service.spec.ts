import { GeneratePdfLpdService } from './generate_pdf_lpd.service';
import { SheetPdfData } from './sheet-pdf.shared';

describe('GeneratePdfLpdService.buildHtml', () => {
  let service: GeneratePdfLpdService;
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
  ];

  beforeEach(() => {
    service = new GeneratePdfLpdService();
  });

  function data(verified: number[] = [], qr: string[] = []): SheetPdfData {
    return {
      tanggal: '2026-08-21',
      nomor: 'N-001',
      perihal: 'Perihal Test',
      diusulkanOleh: 'Citra',
      jabatanDiusulkan: 'Kepala Unit',
      referensiDari: 'Dari A',
      referensiNomor: 'R-1',
      referensiTanggal: '2026-08-10',
      klasifikasi: 'Penting',
      lampiran: '1 (satu) berkas',
      catatan: 'cat',
      directors: directors(qr),
      verifiedIndices: new Set(verified),
    };
  }

  it('memuat judul LEMBAR PERSETUJUAN DIREKSI & header PERUM LPPNPI', () => {
    expect(service.buildHtml(data())).toContain('LEMBAR PERSETUJUAN DIREKSI');
    expect(service.buildHtml(data())).toContain('PERUSAHAAN UMUM (PERUM)');
  });

  it('memuat field terstruktur: tanggal, nomor, perihal, diusulkan, klasifikasi, lampiran', () => {
    const html = service.buildHtml(data());
    expect(html).toContain('21 Agustus 2026');
    expect(html).toContain('N-001');
    expect(html).toContain('Perihal Test');
    expect(html).toContain('Citra');
    expect(html).toContain('Penting');
    expect(html).toContain('1 (satu) berkas');
  });

  it('memuat nama & jabatan setiap direksi', () => {
    const html = service.buildHtml(data());
    expect(html).toContain('ANDI');
    expect(html).toContain('DIREKTUR OPERASI');
    expect(html).toContain('BINA');
    expect(html).toContain('DIREKTUR TEKNIK');
  });

  it('menempatkan status delegasi pada jabatan, bukan nama', () => {
    const payload = data();
    payload.diketahuiOleh = [
      {
        index: 1,
        nama: 'Bina',
        jabatan: 'DIREKTUR TEKNIK',
        delegator: 'PH',
      },
    ];
    const html = service.buildHtml(payload);
    expect(html).toContain('PH. DIREKTUR TEKNIK');
    expect(html).toContain('BINA');
    expect(html).not.toContain('PH. BINA');
  });

  it('merender visual digsig HANYA untuk direksi yang verified', () => {
    const html = service.buildHtml(data([1], ['QR1', 'QR2']));
    expect(html).toContain('class="visible-digsig');
    expect(html).toContain('Ditandatangani secara elektronik oleh');
    expect(html).toContain('ANDI');
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain('data:image/png;base64,QR1');
    expect(html).not.toContain('data:image/png;base64,QR2');
  });

  it('tidak merender visual digsig bila tidak ada yang verified (slot sig-space)', () => {
    const html = service.buildHtml(data([], ['QR1', 'QR2']));
    expect(html).toContain('sig-space');
    expect(html).not.toContain('class="visible-digsig');
    expect(html).not.toContain('data:image/png;base64,');
  });

  it('tidak membocorkan chrome nota dinas (N O T A   D I N A S / Kepada Yth)', () => {
    const html = service.buildHtml(data());
    expect(html).not.toContain('NOTA');
    expect(html).not.toContain('Kepada Yth');
  });
});
