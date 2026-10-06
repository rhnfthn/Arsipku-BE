import { Injectable, BadRequestException } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import PizZip from 'pizzip';
import { DocxFillerService } from '../../naskah-umum/services/docx-filler.service';

export interface SignedSigner {
  index: number;
  /** Gambar visualisasi digsig bila sudah dibuat oleh pemanggil. */
  visualBuffer?: Buffer;
  /** Kompatibilitas payload lama. Tidak lagi dipakai untuk slot tanda tangan baru. */
  qrBuffer?: Buffer;
  /** Nama penandatangan untuk visualisasi dan {{nama_penandatangan_N}}.
   *  Kosong → fallback 'NAMA LENGKAP' (slot belum punya nama). */
  nama?: string;
  /** Jabatan penandatangan untuk mengisi {{jabatan_penandatangan_N}}. */
  jabatan?: string;
  /** NIK/persnum penandatangan untuk mengisi {{nik_penandatangan_N}}. */
  nik?: string | number;
}

// Visualisasi Digsig 4:1, proporsinya sama dengan canvas profile (960×240 px).
// ponytail: diperkecil ~45% (320×80 -> 176×44) agar tidak menimpa digsig signer
// lain saat multiple penandatangan. Canvas 960×240 tetap (downscale DPI tinggi).
const VISIBLE_DIGSIG_WIDTH_EMU = 1_676_400; // 176 px @96dpi
const VISIBLE_DIGSIG_HEIGHT_EMU = 419_100; // 44 px @96dpi

interface PlaceholderTag {
  index: number;
  key: string;
}

/**
 * Inject visualisasi Digsig sebagai inline image ke {{tanda_tangan_N}} di docx.
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
    const imageByIndex = new Map<number, Buffer>();
    for (const signer of signedSigners) {
      imageByIndex.set(
        signer.index,
        signer.visualBuffer ?? (await this.createVisibleDigsig(signer)),
      );
    }

    // (1) Scan semua indeks placeholder di docx asli.
    const signerTags = this.scanTags(originalBuffer, prefix);
    const indices = this.uniqueIndices(signerTags);
    if (indices.length === 0) {
      throw new BadRequestException(
        `Template tidak memiliki placeholder {{${prefix}_*}}.`,
      );
    }

    // (2) Pass-1: docxtemplater text replace → marker untuk signed, literal untuk unsigned.
    // extraFillData (mis. { nomor }) di-merge sekali pass — hemat 1 docxtemplater pass.
    // docxtemplater ignore key tanpa placeholder cocok → aman bila placeholder absen.
    const data: Record<string, string> = { ...extraFillData };
    for (const tag of signerTags) {
      data[tag.key] = signedSet.has(tag.index)
        ? `<<QRIMG_${prefix}_${tag.index}>>`
        : `{{${tag.key}}}`;
    }
    // Slot nama {{nama_penandatangan_N}} (di bawah QR): signed → nama penandatangan,
    // unsigned → 'NAMA LENGKAP' (template literal sebelum sign). Absen → no-op.
    const namaByIndex = new Map(
      signedSigners.map((s) => [s.index, s.nama ?? 'NAMA LENGKAP']),
    );
    const namaTags = this.scanTags(originalBuffer, 'nama_penandatangan');
    for (const tag of namaTags) {
      data[tag.key] = signedSet.has(tag.index)
        ? this.applyPlaceholderCase(
            namaByIndex.get(tag.index) ?? 'NAMA LENGKAP',
            tag.key,
          )
        : 'NAMA LENGKAP';
    }
    const jabatanByIndex = new Map(
      signedSigners.map((s) => [s.index, s.jabatan ?? 'JABATAN']),
    );
    const jabatanTags = this.scanTags(originalBuffer, 'jabatan_penandatangan');
    for (const tag of jabatanTags) {
      data[tag.key] = signedSet.has(tag.index)
        ? this.applyPlaceholderCase(
            jabatanByIndex.get(tag.index) ?? 'JABATAN',
            tag.key,
          )
        : 'JABATAN';
    }
    const nikByIndex = new Map(
      signedSigners.map((s) => [
        s.index,
        s.nik != null ? String(s.nik) : 'NIK',
      ]),
    );
    const nikTags = this.scanTags(originalBuffer, 'nik_penandatangan');
    for (const tag of nikTags) {
      data[tag.key] = signedSet.has(tag.index)
        ? this.applyPlaceholderCase(nikByIndex.get(tag.index) ?? 'NIK', tag.key)
        : 'NIK';
    }
    const pass1 = this.docxFiller.fill(originalBuffer, data);

    // (3) Pass-2: PizZip ganti marker <<QRIMG_${prefix}_${i}>> dengan inline image.
    return this.injectImages(
      pass1,
      indices.filter((i) => signedSet.has(i)),
      imageByIndex,
      prefix,
    );
  }

  /** Scan indeks {{prefix_N}} unik dari document.xml (urut ascending). */
  private scanIndices(buffer: Buffer, prefix: string): number[] {
    return this.uniqueIndices(this.scanTags(buffer, prefix));
  }

  private scanTags(buffer: Buffer, prefix: string): PlaceholderTag[] {
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    const regex = new RegExp(
      `{{\\s*(${this.escapeRegExp(prefix)}_(\\d+))\\s*}}`,
      'gi',
    );
    const matches = [...xml.matchAll(regex)];
    return matches
      .map((m) => ({ key: m[1], index: Number(m[2]) }))
      .sort((a, b) => a.index - b.index);
  }

  private uniqueIndices(tags: PlaceholderTag[]): number[] {
    return [...new Set(tags.map((tag) => tag.index))].sort((a, b) => a - b);
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private applyPlaceholderCase(value: string, key: string): string {
    return /[A-Z]/.test(key) && key === key.toUpperCase()
      ? value.toUpperCase()
      : value;
  }

  private injectImages(
    buffer: Buffer,
    indices: number[],
    imageByIndex: Map<number, Buffer>,
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
    const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    let nextId = (existingIds.length ? Math.max(...existingIds) : 0) + 1;

    // docPr id unik: cari max numeric <wp:docPr id="..."> existing, mulai dari situ.
    // Mencegah collision dengan letterhead/logo header template yang sering mulai dari id=1.
    const existingDocPrIds = [
      ...docXml.matchAll(/<wp:docPr\s+[^>]*id="(\d+)"/g),
    ].map((m) => Number(m[1]));
    const docPrBase =
      (existingDocPrIds.length ? Math.max(...existingDocPrIds) : 0) + 1;
    let drawingSeq = 0;

    for (const i of indices) {
      const rId = `rId${nextId++}`;
      const docPrId = docPrBase + drawingSeq++;
      const mediaPath = `word/media/digsig_${prefix}_${i}.png`;
      const relTarget = `media/digsig_${prefix}_${i}.png`;

      // (a) tulis image part.
      zip.file(mediaPath, imageByIndex.get(i) as Buffer, { binary: true });

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
      // Pusatkan slot tanda tangan yang berada pada paragraf tersendiri.
      // Paragraf campuran tetap mengikuti tata letak template naskah.
      docXml = docXml.replace(
        /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,
        (paragraph) => {
          const text = [
            ...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g),
          ]
            .map((match) => match[1])
            .join('')
            .trim();
          if (text !== marker) return paragraph;
          const alignment = '<w:jc w:val="center"/>';
          if (/<w:pPr\s*\/>/.test(paragraph)) {
            return paragraph.replace(
              /<w:pPr\s*\/>/,
              `<w:pPr>${alignment}</w:pPr>`,
            );
          }
          if (/<w:pPr[\s>]/.test(paragraph)) {
            return paragraph.replace(
              /<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/,
              (_, properties) =>
                `<w:pPr>${properties.replace(/<w:jc\b[^>]*(?:\/>|>[\s\S]*?<\/w:jc>)/g, '')}${alignment}</w:pPr>`,
            );
          }
          return paragraph.replace(
            /(<w:p(?:\s[^>]*)?>)/,
            `$1<w:pPr>${alignment}</w:pPr>`,
          );
        },
      );
      docXml = docXml.split(marker).join(replacement);
    }

    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
    zip.file('[Content_Types].xml', ctXml);
    return zip.generate({ type: 'nodebuffer' });
  }

  /** Bangun XML <w:drawing> inline untuk visualisasi Digsig. */
  private inlineDrawingXml(
    rId: string,
    docPrId: number,
    signerIndex: number,
    prefix: string,
  ): string {
    const a = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const pic =
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    return (
      `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${VISIBLE_DIGSIG_WIDTH_EMU}" cy="${VISIBLE_DIGSIG_HEIGHT_EMU}"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${docPrId}" name="Visualisasi Digsig ${prefix} ${signerIndex}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks ${a} noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic ${a}><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic ${pic}><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="digsig_${prefix}_${signerIndex}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${VISIBLE_DIGSIG_WIDTH_EMU}" cy="${VISIBLE_DIGSIG_HEIGHT_EMU}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing>`
    );
  }

  private async createVisibleDigsig(signer: SignedSigner): Promise<Buffer> {
    const width = 960;
    const height = 240;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    const logoX = 28;
    const logoY = 20;
    const logoSize = 200;
    const logoPath = this.findVisibleDigsigLogo();
    if (logoPath) {
      try {
        const logo = await loadImage(logoPath);
        const ratio = Math.min(logoSize / logo.width, logoSize / logo.height);
        const w = logo.width * ratio;
        const h = logo.height * ratio;
        ctx.drawImage(
          logo,
          logoX + (logoSize - w) / 2,
          logoY + (logoSize - h) / 2,
          w,
          h,
        );
      } catch {
        // Teks tetap menjadi visualisasi valid bila aset logo tidak dapat dibaca.
      }
    }

    const textX = logoX + logoSize + 32;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    ctx.font = '22px "Times New Roman"';
    ctx.fillText(
      'Ditandatangani secara elektronik oleh',
      textX,
      52,
      width - textX - 28,
    );
    ctx.font = 'bold 22px "Times New Roman"';
    ctx.fillText(signer.jabatan || 'JABATAN', textX, 84, width - textX - 28);
    ctx.font = 'bold 33px "Times New Roman"';
    ctx.fillText(
      (signer.nama || 'NAMA LENGKAP TANPA GELAR').toUpperCase(),
      textX,
      142,
      width - textX - 28,
    );
    return canvas.toBuffer('image/png');
  }

  private findVisibleDigsigLogo(): string | undefined {
    return [
      process.env.VISUAL_DIGSIG_LOGO_PATH,
      path.resolve(process.cwd(), '../fe/public/logoAirnav.png'),
      path.resolve(process.cwd(), 'public/logoAirnav.png'),
      // Runtime image backend membawa aset ini ke /app/public.
      path.resolve(process.cwd(), 'public/logo_airnav.jpg'),
    ].find(
      (candidate): candidate is string =>
        !!candidate && fs.existsSync(candidate),
    );
  }
}
