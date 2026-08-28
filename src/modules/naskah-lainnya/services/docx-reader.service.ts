import { BadRequestException, Injectable } from '@nestjs/common';
import PizZip from 'pizzip';

export interface DocxParameter {
  perihal?: string;
  tanggal?: string;
}

@Injectable()
export class DocxReaderService {
  /** Ekstrak teks polos dari word/document.xml. */
  public extractText(buffer: Buffer): string {
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

  /**
   * Deteksi slot penandatangan dari placeholder {{tanda_tangan_N}} di docx.
   * Return count + slot berurutan 1..N. Throw jika indeks tidak contiguous.
   *
   * Juga memindai placeholder metadata penandatangan:
   * - {{nama_penandatangan_N}}
   * - {{jabatan_penandatangan_N}}
   * - {{nik_penandatangan_N}}
   * Bila ada, indeksnya harus cocok persis dengan {{tanda_tangan_*}}
   * (validasi template). Absen → array kosong (backward-compat).
   */
  readSignerSlots(buffer: Buffer): {
    count: number;
    slots: { index: number }[];
    namaIndices: number[];
    jabatanIndices: number[];
    nikIndices: number[];
  } {
    const text = this.extractText(buffer);
    const matches = [...text.matchAll(/{{\s*tanda_tangan_(\d+)\s*}}/gi)];
    const indices = [...new Set(matches.map((m) => Number(m[1])))].sort((a, b) => a - b);
    const count = indices.length;
    // Validasi contiguous 1..N
    for (let i = 0; i < count; i++) {
      if (indices[i] !== i + 1) {
        throw new BadRequestException(
          `Indeks {{tanda_tangan_*}} tidak berurutan: ditemukan ${indices.join(',')}, diharapkan 1..${count}.`,
        );
      }
    }
    const scanOptional = (name: string): number[] => {
      const regex = new RegExp(`{{\\s*${name}_(\\d+)\\s*}}`, 'gi');
      const found = [...text.matchAll(regex)]
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b);
      const placeholderIndices = [...new Set(found)];
      if (placeholderIndices.length > 0) {
        const same =
          placeholderIndices.length === indices.length &&
          placeholderIndices.every((v, i) => v === indices[i]);
        if (!same) {
          throw new BadRequestException(
            `Placeholder {{${name}_*}} tidak cocok dengan {{tanda_tangan_*}}: ${name}=[${placeholderIndices.join(',')}], ttd=[${indices.join(',')}].`,
          );
        }
      }
      return placeholderIndices;
    };

    const namaIndices = scanOptional('nama_penandatangan');
    const jabatanIndices = scanOptional('jabatan_penandatangan');
    const nikIndices = scanOptional('nik_penandatangan');

    return {
      count,
      slots: indices.map((index) => ({ index })),
      namaIndices,
      jabatanIndices,
      nikIndices,
    };
  }

  /** Baca parameter nomor/perihal/tanggal dari buffer .docx. */
  async readParameters(buffer: Buffer): Promise<DocxParameter> {
    const text = this.extractText(buffer);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

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

    return { perihal, tanggal };
  }
}
