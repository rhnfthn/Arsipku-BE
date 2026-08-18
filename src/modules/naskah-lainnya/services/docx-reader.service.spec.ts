import { Test } from '@nestjs/testing';
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

  it('membaca nomor, perihal, dan tanggal dari teks dokumen', async () => {
    const doc = buildDocx(
      '<w:p><w:r><w:t>NOMOR: PER.1/DS.00.02/2026</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Perihal: Tata Naskah Dinas</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Pada tanggal: 10-08-2026</w:t></w:r></w:p>',
    );
    const p = await svc.readParameters(doc);
    expect(p.nomor).toBe('PER.1/DS.00.02/2026');
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
    expect(p.nomor).toBe('KEP/123/TEST/456');
    expect(p.perihal).toBe('SOSIALISASI LOMBA 17 AGUSTUS 2027');
    // tanggal kosong di template → tidak ada false-positive dari "17 Agustus 2027"
    expect(p.tanggal).toBeUndefined();
  });

  it('tidak error bila parameter tidak ditemukan', async () => {
    const p = await svc.readParameters(buildDocx('<w:p><w:r><w:t>Dokumen biasa</w:t></w:r></w:p>'));
    expect(p.nomor).toBeUndefined();
    expect(p.perihal).toBeUndefined();
    expect(p.tanggal).toBeUndefined();
  });
});