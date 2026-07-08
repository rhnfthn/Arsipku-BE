import { DocxFillerService } from './docx-filler.service';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import PizZip from 'pizzip';

describe('DocxFillerService', () => {
  let service: DocxFillerService;

  beforeEach(() => {
    service = new DocxFillerService();
  });

  async function createTemplateBuffer(paragraphs: Paragraph[]): Promise<Buffer> {
    const doc = new Document({
      sections: [{ children: paragraphs }],
    });
    return (await Packer.toBuffer(doc)) as Buffer;
  }

  function readDocumentXml(buffer: Buffer): string {
    const zip = new PizZip(buffer);
    return zip.file('word/document.xml')?.asText() ?? '';
  }

  describe('fill', () => {
    it('replaces {{perihal}} and {{dari}} placeholders with values', async () => {
      const templateBuffer = await createTemplateBuffer([
        new Paragraph({ children: [new TextRun('Perihal: {{perihal}}')] }),
        new Paragraph({ children: [new TextRun('Dari: {{dari}}')] }),
      ]);

      const outputBuffer = service.fill(templateBuffer, {
        perihal: 'Undangan Rapat',
        dari: 'Divisi Ops',
      });

      expect(outputBuffer).toBeInstanceOf(Buffer);
      expect(outputBuffer.length).toBeGreaterThan(0);

      const documentXml = readDocumentXml(outputBuffer);
      expect(documentXml).toContain('Undangan Rapat');
      expect(documentXml).toContain('Divisi Ops');
      expect(documentXml).not.toContain('{{perihal}}');
      expect(documentXml).not.toContain('{{dari}}');
    });

    it('handles array values (joined by docxtemplater)', async () => {
      const templateBuffer = await createTemplateBuffer([
        new Paragraph({ children: [new TextRun('Tujuan: {{tujuan}}')] }),
      ]);

      const outputBuffer = service.fill(templateBuffer, {
        tujuan: ['Tim A', 'Tim B'],
      });

      expect(outputBuffer).toBeInstanceOf(Buffer);
      expect(outputBuffer.length).toBeGreaterThan(0);

      const documentXml = readDocumentXml(outputBuffer);
      expect(documentXml).toContain('Tim A');
    });
  });
});
