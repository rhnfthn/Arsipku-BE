import { Injectable, BadRequestException } from '@nestjs/common';
import PizZip from 'pizzip';
import { DocxFillerService } from '../../naskah-umum/services/docx-filler.service';

export interface SignedSigner {
  index: number;
  qrBuffer: Buffer;
}

// Ukuran QR inline (EMU). 1 px @96dpi = 9525 EMU. 80px ≈ 762000 EMU.
// Disamakan dengan templat nota dinas / SDI / DI yang merender QR 80×80px.
const QR_EMU = 762000;

/**
 * Inject QR code sebagai inline image ke placeholder {{tanda_tangan_N}} di docx.
 *
 * Two-pass: pass-1 docxtemplater (text) menyetarakan placeholder yang ter-split
 * run di Word jadi marker <<QRIMG_i>> (single-run). pass-2 PizZip mengganti marker
 * dengan <w:drawing> inline image + image part + rel + content-type.
 *
 * ponytail: ceiling — pass-1 docxtemplater menangani run-split antar <w:t> dalam
 * satu paragraf (kasus umum). Marker pass-2 diasumsikan single-run (dijamin oleh
 * pass-1). Tidak pakai @docxtemplater/image-module (berbayar) — direct XML PizZip.
 */
@Injectable()
export class DocxQrInlineService {
  constructor(private readonly docxFiller: DocxFillerService) {}

  async injectQrSigners(
    originalBuffer: Buffer,
    signedSigners: SignedSigner[],
    extraFillData?: Record<string, string>,
    options?: { placeholderPrefix?: string },
  ): Promise<Buffer> {
    const prefix = options?.placeholderPrefix ?? 'tanda_tangan';
    const signedSet = new Set(signedSigners.map((s) => s.index));
    const qrByIndex = new Map(signedSigners.map((s) => [s.index, s.qrBuffer]));

    // (1) Scan semua indeks placeholder di docx asli.
    const indices = this.scanIndices(originalBuffer, prefix);
    if (indices.length === 0) {
      throw new BadRequestException(
        `Template tidak memiliki placeholder {{${prefix}_*}}.`,
      );
    }

    // (2) Pass-1: docxtemplater text replace → marker untuk signed, literal untuk unsigned.
    // extraFillData (mis. { nomor }) di-merge sekali pass — hemat 1 docxtemplater pass.
    // docxtemplater ignore key tanpa placeholder cocok → aman bila placeholder absen.
    const data: Record<string, string> = { ...extraFillData };
    for (const i of indices) {
      data[`${prefix}_${i}`] = signedSet.has(i)
        ? `<<QRIMG_${prefix}_${i}>>`
        : `{{${prefix}_${i}}}`;
    }
    const pass1 = this.docxFiller.fill(originalBuffer, data);

    // (3) Pass-2: PizZip ganti marker <<QRIMG_${prefix}_${i}>> dengan inline image.
    return this.injectImages(pass1, indices.filter((i) => signedSet.has(i)), qrByIndex, prefix);
  }

  /** Scan indeks {{prefix_N}} unik dari document.xml (urut ascending). */
  private scanIndices(buffer: Buffer, prefix: string): number[] {
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    const regex = new RegExp(`{{\\s*${this.escapeRegExp(prefix)}_(\\d+)\\s*}}`, 'gi');
    const matches = [...xml.matchAll(regex)];
    return [...new Set(matches.map((m) => Number(m[1])))].sort((a, b) => a - b);
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private injectImages(
    buffer: Buffer,
    indices: number[],
    qrByIndex: Map<number, Buffer>,
    prefix: string,
  ): Buffer {
    const zip = new PizZip(buffer);
    let docXml = zip.file('word/document.xml')?.asText() ?? '';
    let relsXml = zip.file('word/_rels/document.xml.rels')?.asText() ?? '';
    let ctXml = zip.file('[Content_Types].xml')?.asText() ?? '';

    // Default png di [Content_Types].xml (sekali).
    if (!/Extension="png"/i.test(ctXml)) {
      ctXml = ctXml.replace(
        /(<Types[^>]*>)/,
        `$1<Default Extension="png" ContentType="image/png"/>`,
      );
    }

    // rId unik: cari max numeric rId existing, mulai dari situ.
    const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
    let nextId = (existingIds.length ? Math.max(...existingIds) : 0) + 1;

    // docPr id unik: cari max numeric <wp:docPr id="..."> existing, mulai dari situ.
    // Mencegah collision dengan letterhead/logo header template yang sering mulai dari id=1.
    const existingDocPrIds = [...docXml.matchAll(/<wp:docPr\s+[^>]*id="(\d+)"/g)].map((m) => Number(m[1]));
    const docPrBase = (existingDocPrIds.length ? Math.max(...existingDocPrIds) : 0) + 1;
    let drawingSeq = 0;

    for (const i of indices) {
      const rId = `rId${nextId++}`;
      const docPrId = docPrBase + drawingSeq++;
      const mediaPath = `word/media/qr_${prefix}_${i}.png`;
      const relTarget = `media/qr_${prefix}_${i}.png`;

      // (a) tulis image part.
      zip.file(mediaPath, qrByIndex.get(i) as Buffer, { binary: true });

      // (b) tambah relationship.
      const rel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTarget}"/>`;
      relsXml = relsXml.replace(/(<Relationships[^>]*>)/, `$1${rel}`);

      // (c) ganti marker <<QRIMG_${prefix}_${i}>> dengan run-split inline drawing.
      // ponytail: docxtemplater XML-escapes text values, so `<<`/`>>` di document.xml
      // menjadi `&lt;&lt;`/`&gt;&gt;`. Split pada bentuk escaped; replacement menyisipkan
      // drawing run di luar <w:t> jadi tidak di-escape ulang.
      // docPrId unik (bukan signer index) untuk id; name pakai signer index (readability).
      const drawing = this.inlineDrawingXml(rId, docPrId, i, prefix);
      const marker = `&lt;&lt;QRIMG_${prefix}_${i}&gt;&gt;`;
      // Marker berada di dalam <w:t>...&lt;&lt;QRIMG_i&gt;&gt;...</w:t>. Tutup text+run,
      // sisip drawing run, buka kembali run+text untuk teks sisa.
      const replacement = `</w:t></w:r><w:r>${drawing}</w:r><w:r><w:t xml:space="preserve">`;
      docXml = docXml.split(marker).join(replacement);
    }

    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
    zip.file('[Content_Types].xml', ctXml);
    return zip.generate({ type: 'nodebuffer' });
  }

  /** Bangun XML <w:drawing> inline untuk QR dengan rId + docPr id unik. */
  private inlineDrawingXml(
    rId: string,
    docPrId: number,
    signerIndex: number,
    prefix: string,
  ): string {
    const a = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const pic = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    return (
      `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${QR_EMU}" cy="${QR_EMU}"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${docPrId}" name="QR ${prefix} ${signerIndex}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks ${a} noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic ${a}><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic ${pic}><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="qr_${prefix}_${signerIndex}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${QR_EMU}" cy="${QR_EMU}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing>`
    );
  }
}
