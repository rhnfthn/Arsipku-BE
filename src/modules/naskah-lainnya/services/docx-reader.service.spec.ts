import { Test } from '@nestjs/testing';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { DocxReaderService } from './docx-reader.service';
import PizZip from 'pizzip';

function buildDocx(text: string): Buffer {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
     <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
       <w:body>${text}</w:body>
     </w:document>`,
  );
  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

describe('DocxReaderService', () => {
  let svc: DocxReaderService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({ providers: [DocxReaderService] }).compile();
    svc = mod.get(DocxReaderService);
  });

  it('membaca perihal dan tanggal dari teks dokumen (tanpa nomor)', async () => {
    const doc = buildDocx(
      '<w:p><w:r><w:t>NOMOR: PER.1/DS.00.02/2026</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Perihal: Tata Naskah Dinas</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Pada tanggal: 10-08-2026</w:t></w:r></w:p>',
    );
    const p = await svc.readParameters(doc);
    expect(p.perihal).toBe('Tata Naskah Dinas');
    expect(p.tanggal).toBe('10-08-2026');
  });

  it('membaca TENTANG di baris sendiri + content di baris berikutnya (template KEP)', async () => {
    const doc = buildDocx(
      '<w:p><w:r><w:t>NOMOR: KEP/123/TEST/456</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>TENTANG</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>SOSIALISASI LOMBA 17 AGUSTUS 2027</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Pada tanggal  :   </w:t></w:r></w:p>',
    );
    const p = await svc.readParameters(doc);
    // nomor tidak lagi di-scrape dari dokumen
    expect(p.perihal).toBe('SOSIALISASI LOMBA 17 AGUSTUS 2027');
    // tanggal kosong di template → tidak ada false-positive dari "17 Agustus 2027"
    expect(p.tanggal).toBeUndefined();
  });

  it('tidak error bila parameter tidak ditemukan', async () => {
    const p = await svc.readParameters(buildDocx('<w:p><w:r><w:t>Dokumen biasa</w:t></w:r></w:p>'));
    expect(p.perihal).toBeUndefined();
    expect(p.tanggal).toBeUndefined();
  });
});

describe('DocxReaderService.readSignerSlots', () => {
  let service: DocxReaderService;
  beforeEach(() => { service = new DocxReaderService(); });

  async function docxWith(text: string): Promise<Buffer> {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] });
    return Packer.toBuffer(doc);
  }

  it('mendeteksi 3 slot berurutan', async () => {
    const buf = await docxWith('Ditandatangani oleh {{tanda_tangan_1}}, {{tanda_tangan_2}}, dan {{tanda_tangan_3}}.');
    const res = service.readSignerSlots(buf);
    expect(res.count).toBe(3);
    expect(res.slots).toEqual([{ index: 1 }, { index: 2 }, { index: 3 }]);
  });

  it('mendeteksi 0 slot jika tidak ada placeholder', async () => {
    const buf = await docxWith('Naskah tanpa penandatangan.');
    const res = service.readSignerSlots(buf);
    expect(res.count).toBe(0);
    expect(res.slots).toEqual([]);
  });

  it('melempar error jika indeks tidak contiguous (gap)', async () => {
    const buf = await docxWith('{{tanda_tangan_1}} dan {{tanda_tangan_3}}');
    expect(() => service.readSignerSlots(buf)).toThrow();
  });
});
