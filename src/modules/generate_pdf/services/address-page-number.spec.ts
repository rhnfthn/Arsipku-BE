import { getBrowser } from '../puppeteer.provider';
import { GeneratePdfKajianService } from './generate_pdf_kajian.service';
import { GeneratePdfNodinService } from './generate_pdf_nodin.service';
import { GeneratePdfSudinService } from './generate_pdf_sudin.service';

jest.mock('../pdf.queue', () => ({
  pdfQueue: {
    add: jest.fn((task: () => Promise<Buffer>) => task()),
  },
}));

jest.mock('../puppeteer.provider', () => ({
  getBrowser: jest.fn(),
  resetBrowser: jest.fn(),
}));

describe('PDF address page document number', () => {
  const documentNumber = '001/OPS.01/IX/2026';
  let renderedHtml = '';
  let page: any;

  beforeEach(() => {
    renderedHtml = '';
    page = {
      setDefaultTimeout: jest.fn(),
      setJavaScriptEnabled: jest.fn(),
      setRequestInterception: jest.fn(),
      on: jest.fn(),
      setContent: jest.fn(async (html: string) => {
        renderedHtml = html;
      }),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      isClosed: jest.fn().mockReturnValue(false),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (getBrowser as jest.Mock).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue(page),
    });
  });

  const recipients = Array.from(
    { length: 6 },
    (_, index) => `Penerima ${index + 1}`,
  );
  const copies = Array.from(
    { length: 6 },
    (_, index) => `Tembusan ${index + 1}`,
  );

  it('renders nomor surat on Nota Dinas address page', async () => {
    await new GeneratePdfNodinService().generatePdf({
      html: '<p>Konten</p>',
      nomor: documentNumber,
      tertuju: recipients,
      tanggal: '9 September 2026',
    });

    expect(renderedHtml).toContain('Periksa Alamat Terlampir');
    expect(renderedHtml).toContain(`Nomor Surat : ${documentNumber}`);
  });

  it('renders nomor surat when Nota Dinas copies create the address page', async () => {
    await new GeneratePdfNodinService().generatePdf({
      html: '<p>Konten</p>',
      nomor: documentNumber,
      tertuju: ['Penerima'],
      tembusan: copies,
      tanggal: '9 September 2026',
    });

    expect(renderedHtml).toContain('<b>TEMBUSAN :</b>');
    expect(renderedHtml).toContain(`Nomor Surat : ${documentNumber}`);
  });

  it('renders nomor surat on Surat Dinas Internal address page', async () => {
    await new GeneratePdfSudinService().generatePdf({
      html: '<p>Konten</p>',
      nomorSurat: documentNumber,
      penerima: recipients,
      tanggal: '9 September 2026',
    });

    expect(renderedHtml).toContain('Periksa Alamat Terlampir');
    expect(renderedHtml).toContain(`Nomor Surat : ${documentNumber}`);
  });

  it('renders nomor surat when Surat Dinas Internal copies create the address page', async () => {
    await new GeneratePdfSudinService().generatePdf({
      html: '<p>Konten</p>',
      nomor: documentNumber,
      penerima: ['Penerima'],
      tembusan: copies,
      tanggal: '9 September 2026',
    });

    expect(renderedHtml).toContain('<b>TEMBUSAN :</b>');
    expect(renderedHtml).toContain(`Nomor Surat : ${documentNumber}`);
  });

  it('renders an attached address page for Surat Dinas Eksternal recipients', async () => {
    await new GeneratePdfSudinService().generatePdf({
      html: '<p>Content</p>',
      nomor: documentNumber,
      penerima: recipients,
      tanggal: '9 September 2026',
      english: true,
    });

    expect(renderedHtml).toContain('Please See Attached Address List');
    expect(renderedHtml).toContain(`Letter Number : ${documentNumber}`);
  });

  it('renders nomor on Kajian address page', async () => {
    await new GeneratePdfKajianService().generatePdf({
      html: '<p>Konten</p>',
      document_number: documentNumber,
      tertuju: recipients,
      tanggal: '9 September 2026',
    });

    expect(renderedHtml).toContain('Periksa Alamat Terlampir');
    expect(renderedHtml).toContain(`Nomor : ${documentNumber}`);
  });

  it('renders nomor when Kajian copies create the address page', async () => {
    await new GeneratePdfKajianService().generatePdf({
      html: '<p>Konten</p>',
      nomor: documentNumber,
      tertuju: ['Penerima'],
      tembusan: copies,
      tanggal: '9 September 2026',
    });

    expect(renderedHtml).toContain('<b>TEMBUSAN :</b>');
    expect(renderedHtml).toContain(`Nomor : ${documentNumber}`);
  });
});
