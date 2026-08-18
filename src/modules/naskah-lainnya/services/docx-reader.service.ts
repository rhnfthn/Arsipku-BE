import { Injectable } from '@nestjs/common';
import PizZip from 'pizzip';

export interface DocxParameter {
  nomor?: string;
  perihal?: string;
  tanggal?: string;
}

@Injectable()
export class DocxReaderService {
  /** Ekstrak teks polos dari word/document.xml. */
  private extractText(buffer: Buffer): string {
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    return xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<w:tr[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\r/g, '');
  }

  /** Baca parameter nomor/perihal/tanggal dari buffer .docx. */
  async readParameters(buffer: Buffer): Promise<DocxParameter> {
    const text = this.extractText(buffer);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // NOMOR: cari baris yang diawali "NOMOR" lalu ambil sisanya.
    // Format template: "NOMOR: KEP/123/TEST/456" atau "NOMOR: PER.012/DS.00.02/2026"
    const nomorLine = lines.find((l) => /^NOMOR\s*[:.]?\s*\S/i.test(l));
    const nomor = nomorLine
      ?.replace(/^NOMOR\s*[:.]?\s*/i, '')
      .trim() || undefined;

    // PERIHAL/TENTANG: cari baris yang diawali "perihal" atau "tentang".
    // Pada template KEP, "TENTANG" di baris sendiri, content di baris berikutnya.
    const perihalIdx = lines.findIndex((l) => /^(?:perihal|tentang)\s*[:.]?\s*$/i.test(l));
    let perihal: string | undefined;
    if (perihalIdx >= 0 && perihalIdx + 1 < lines.length) {
      // "TENTANG" di baris sendiri → ambil baris berikutnya
      perihal = lines[perihalIdx + 1].trim() || undefined;
    } else {
      // Format inline: "Perihal: Tata Naskah Dinas"
      const perihalLine = lines.find((l) => /^(?:perihal|tentang)\s*[:.]?\s*\S/i.test(l));
      perihal = perihalLine?.replace(/^(?:perihal|tentang)\s*[:.]?\s*/i, '').trim() || undefined;
    }

    // TANGGAL: cari baris yang mengandung "tanggal" (dari "Pada tanggal : ...")
    // Hindari false-positive dari perihal yang mengandung tanggal (mis. "17 Agustus 2027").
    const tanggalLine = lines.find((l) => /tanggal\s*[:.]?\s*\S/i.test(l));
    let tanggal: string | undefined;
    if (tanggalLine) {
      const afterColon = tanggalLine.replace(/^.*tanggal\s*[:.]?\s*/i, '').trim();
      if (afterColon) {
        tanggal =
          afterColon.match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/)?.[0] ??
          afterColon.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/)?.[0];
      }
    }
    // Fallback: cari pola tanggal standalone (hanya kalau ada baris yang pure tanggal)
    if (!tanggal) {
      for (const l of lines) {
        const m = l.match(/^(\d{1,2}[-/]\d{1,2}[-/]\d{4})$/) ?? l.match(/^(\d{1,2}\s+[A-Za-z]+\s+\d{4})$/);
        if (m) { tanggal = m[1]; break; }
      }
    }

    return { nomor, perihal, tanggal };
  }
}