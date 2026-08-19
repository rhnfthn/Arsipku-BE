import { Document, Packer, Paragraph, TextRun } from 'docx';
import PizZip from 'pizzip';
import { DocxQrInlineService } from './docx-qr-inline.service';
import { DocxFillerService } from '../../naskah-umum/services/docx-filler.service';

describe('DocxQrInlineService.injectQrSigners', () => {
  let service: DocxQrInlineService;

  beforeEach(() => { service = new DocxQrInlineService(new DocxFillerService()); });

  async function docxWith(text: string): Promise<Buffer> {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] });
    return Packer.toBuffer(doc);
  }

  function xmlOf(buf: Buffer, path: string): string {
    return new PizZip(buf).file(path)?.asText() ?? '';
  }
  function hasFile(buf: Buffer, path: string): boolean {
    return new PizZip(buf).file(path) != null;
  }

  it('men-inject QR ke slot 1 dan menyisakan slot 2 sebagai placeholder', async () => {
    const tpl = await docxWith('TTD: {{tanda_tangan_1}} dan {{tanda_tangan_2}}');
    const qr = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // stub PNG header
    const out = await service.injectQrSigners(tpl, [{ index: 1, qrBuffer: qr }]);

    const docXml = xmlOf(out, 'word/document.xml');
    expect(docXml).toContain('<w:drawing');
    expect(docXml).toContain('r:embed=');
    expect(docXml).not.toContain('QRIMG_1');
    // slot 2 belum ditandatangani → placeholder tetap ada
    expect(docXml).toContain('{{tanda_tangan_2}}');
    // image part + rel + content-type
    expect(hasFile(out, 'word/media/qr_tanda_tangan_1.png')).toBe(true);
    expect(xmlOf(out, 'word/_rels/document.xml.rels')).toContain('qr_tanda_tangan_1.png');
    expect(xmlOf(out, '[Content_Types].xml')).toContain('Extension="png"');
  });

  it('re-render idempotent: inject signer 1..2 sekaligus', async () => {
    const tpl = await docxWith('{{tanda_tangan_1}} {{tanda_tangan_2}}');
    const qr = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const out = await service.injectQrSigners(tpl, [
      { index: 1, qrBuffer: qr },
      { index: 2, qrBuffer: qr },
    ]);
    const docXml = xmlOf(out, 'word/document.xml');
    const drawingCount = (docXml.match(/<w:drawing/g) || []).length;
    expect(drawingCount).toBe(2);
    expect(docXml).not.toContain('{{tanda_tangan_');
    expect(docXml).not.toContain('QRIMG');
  });
});
