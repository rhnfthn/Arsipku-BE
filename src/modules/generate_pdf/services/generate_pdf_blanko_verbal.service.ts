import { Injectable } from '@nestjs/common';
import { getBrowser, resetBrowser } from '../puppeteer.provider';
import { pdfQueue } from '../pdf.queue';
import {
  SheetPdfData,
  DirectorSlot,
  formatSheetName,
  formatSheetPosition,
  formatTanggal,
  renderVisibleDigsig,
  SHEET_CSS,
} from './sheet-pdf.shared';

@Injectable()
export class GeneratePdfBlankoVerbalService {
  async render(data: SheetPdfData): Promise<Buffer> {
    const result = await pdfQueue.add(() => this._renderWithRetry(data), {
      timeout: 90000,
    });
    if (!result)
      throw new Error('Blanko verbal PDF generation timeout/empty result');
    return Buffer.isBuffer(result) ? result : Buffer.from(result as any);
  }

  private isRecoverableBrowserError(error: unknown): boolean {
    const m =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
    return (
      m.includes('connection closed') ||
      m.includes('target closed') ||
      m.includes('session closed') ||
      m.includes('browser has disconnected') ||
      m.includes('protocol error')
    );
  }

  private async _renderWithRetry(data: SheetPdfData): Promise<Buffer> {
    try {
      return await this._renderInternal(data);
    } catch (error) {
      if (!this.isRecoverableBrowserError(error)) throw error;
      await resetBrowser();
      return this._renderInternal(data);
    }
  }

  private async _renderInternal(data: SheetPdfData): Promise<Buffer> {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultTimeout(60000);
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (
          url.startsWith('data:') ||
          url.startsWith('about:blank') ||
          url.startsWith('blob:')
        )
          return req.continue();
        return req.abort();
      });
      await page.setContent(this.buildHtml(data), {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        timeout: 60000,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      });
      return Buffer.from(pdf);
    } finally {
      try {
        if (!page.isClosed()) await page.close();
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Build HTML lengkap Blanko Verbal dari data. Murni (teruji unit).
   * Item direksi 1 & 2 share satu sel kanan (sesuai docs/blanko_verbal.html);
   * item 3+ masing-masing sel sendiri berdampingan dengan baris kiri.
   */
  buildHtml(data: SheetPdfData): string {
    const hasExplicitDiketahui = Array.isArray(data.diketahuiOleh);
    const hasExplicitDitetapkan = Array.isArray(data.ditetapkanOleh);
    const diketahui = hasExplicitDiketahui
      ? data.diketahuiOleh!
      : data.directors;
    const ditetapkan = hasExplicitDitetapkan
      ? data.ditetapkanOleh!
      : data.directors.filter((d) => /direktur\s*utama/i.test(d.jabatan || ''));
    const dir = (i: number) => diketahui[i];
    const nameOf = formatSheetName;
    const positionOf = formatSheetPosition;
    const signerBlock = ditetapkan.length
      ? ditetapkan
          .map((d) => {
            const visual = d.signatureVisible
              ? renderVisibleDigsig(d, 'wide')
              : '<div class="sig-space"></div>';
            return `<div class="signature-person">${positionOf(d)}<br>${visual}<div class="signature-name">${nameOf(d)}</div></div>`;
          })
          .join('')
      : hasExplicitDitetapkan
        ? ''
        : '<div class="signature-person">DIREKTUR UTAMA<br><div class="signature-name">NAMA LENGKAP TANPA GELAR</div></div>';
    // Direktur cell: item pertama selalu; item kedua hanya jika ada direksi ke-2.
    const firstDirectorCell = (): string => {
      const d1 = dir(0);
      const d2 = dir(1);
      const render = (d: DirectorSlot | undefined, i: number): string => {
        if (!d) return '';
        const verified = data.verifiedIndices.has(d.index);
        const paraf = verified
          ? renderVisibleDigsig(d)
          : '<div class="sig-space"></div>';
        const cls =
          i === 0 ? 'director-item director-divider' : 'director-item';
        return `<div class="${cls}">${i + 1}. ${positionOf(d, '')}${paraf}<div class="director-name">${nameOf(d)}</div></div>`;
      };
      return render(d1, 0) + render(d2, 1);
    };
    const slot = (i: number): string => {
      const d = dir(i);
      if (!d) return '&nbsp;';
      const verified = data.verifiedIndices.has(d.index);
      const paraf = verified
        ? renderVisibleDigsig(d)
        : '<div class="sig-space"></div>';
      return `<div class="director-item">${i + 1}. ${positionOf(d, '')}${paraf}<div class="director-name">${nameOf(d)}</div></div>`;
    };

    return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><style>${SHEET_CSS}</style></head><body>
<div class="page">
  <div class="header">
    BLANKO VERBAL<br>
    PERUSAHAAN UMUM (PERUM) LEMBAGA PENYELENGGARA PELAYANAN<br>
    NAVIGASI PENERBANGAN INDONESIA
  </div>

  <table class="top">
    <colgroup>
      <col style="width:24%"><col style="width:2%"><col style="width:32%"><col style="width:14%"><col style="width:2%"><col style="width:26%">
    </colgroup>
    <tr>
      <td>Tangerang/Tgl/Bln/Tahun</td><td class="colon">:</td><td><div class="field">${formatTanggal(data.tanggal)}</div></td>
      <td>Referensi :</td><td colspan="2"><div class="field">&nbsp;</div></td>
    </tr>
    <tr>
      <td><div class="center-text">Diusulkan oleh</div></td>
      <td class="colon">:</td>
      <td><div class="small-italic">${data.diusulkanOleh || '(Nama Pejabat)'}<br>${data.jabatanDiusulkan || '(Jabatan Unit Pemrakarsa)'}</div></td>
      <td rowspan="2">Dari<br>No. Surat<br>Tanggal</td>
      <td rowspan="2" class="colon">:<br>:<br>:</td>
      <td rowspan="2">${data.referensiDari || '&nbsp;'}<br>${data.referensiNomor || '&nbsp;'}<br>${formatTanggal(data.referensiTanggal)}</td>
    </tr>
    <tr>
      <td><div class="center-text">Legal Drafting Dikerjakan oleh</div></td>
      <td class="colon">:</td>
      <td><div class="small-italic">${data.legalDrafter || '(Nama Pejabat)'}<br>${data.legalDrafterJabatan || '(Jabatan)'}</div></td>
    </tr>
    <tr>
      <td><div class="center-text">Legal Drafting Diperiksa Oleh</div></td>
      <td class="colon">:</td>
      <td><div class="small-italic">${data.legalChecker || '(Nama Pejabat)'}<br>${data.legalCheckerJabatan || '(Jabatan)'}</div></td>
      <td>Perihal</td><td class="colon">:</td>
      <td><div class="small-italic">${data.perihal || '&nbsp;'}</div></td>
    </tr>
  </table>

  <div class="body-content">${data.bodyHtml || ''}</div>

  <table style="border-collapse:collapse;width:100%;">
    <colgroup><col style="width:20%"><col style="width:2%"><col style="width:36%"><col style="width:42%"></colgroup>
    <tr>
      <td>Nomor</td><td class="colon">:</td><td><div class="field">${data.nomor || '&nbsp;'}</div></td>
      <td rowspan="2">Sebelum ditetapkan diketahui oleh :</td>
    </tr>
    <tr>
      <td>Tanggal</td><td class="colon">:</td><td><div class="field">${formatTanggal(data.tanggal)}</div></td>
    </tr>
    <tr>
      <td colspan="3">Ditetapkan/Disahkan Oleh</td><td>&nbsp;</td>
    </tr>
    <tr>
      <td colspan="3" style="vertical-align:top;">
        <div class="signature-block">${signerBlock}</div>
      </td>
      <td style="vertical-align:top;">${firstDirectorCell()}</td>
    </tr>
    <tr>
      <td>Penetapan / Pengesahan<br>Perihal</td><td class="colon">:</td>
      <td><div class="small-italic">(${data.perihal || 'Judul Peraturan Direksi, Keputusan Direksi'})</div></td>
      <td style="vertical-align:top;">${slot(2)}</td>
    </tr>
    <tr>
      <td>Klasifikasi</td><td class="colon">:</td><td>${data.klasifikasi || 'Penting'}</td>
      <td style="vertical-align:top;">${slot(3)}</td>
    </tr>
    <tr>
      <td>Lampiran</td><td class="colon">:</td><td>${data.lampiran || '1 (satu) berkas'}</td>
      <td style="vertical-align:top;">${slot(4)}</td>
    </tr>
    <tr>
      <td colspan="4" class="footer-note">Setelah selesai di proses, harap diteruskan kepada (unit yang membidangi hukum)</td>
    </tr>
    <tr>
      <td colspan="4" class="catatan-cell">Catatan : ${data.catatan || ''}</td>
    </tr>
  </table>
</div>
</body></html>`;
  }
}
