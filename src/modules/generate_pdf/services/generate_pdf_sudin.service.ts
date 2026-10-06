import { Injectable } from '@nestjs/common';
import { getBrowser, resetBrowser } from '../puppeteer.provider';
import * as fs from 'fs';
import * as path from 'path';
import { pdfQueue } from '../pdf.queue';
import { resolveDocumentNumber } from '../utils/document-number.util';
import { formatSifatLabel } from '../../../common/helpers/sifat.helper';

interface SdiPdfOptions {
  html: string;
  htmlContent?: string;
  filename?: string;
  dari?: string;
  tanggal?: string;
  positionText?: string;
  namaLengkap?: string;
  perihal?: string;
  penerima?: string[];
  tembusan?: string[];
  sifat?: string;
  lampiran?: string;
  nomor?: string;
  nomorSurat?: string;
  nomor_surat?: string;
  nomorDokumen?: string;
  document_number?: string;
  nama_tempat?: string;
  nama_jabatan?: string;
  // Garis Kewenangan (a.n.) — label pemberi kuasa. Null = tanpa a.n.
  atasNama?: string | null;
  // Dynamic header info dari sub_area_alamat
  headerKantor?: string;
  headerGedung?: string;
  headerAlamat?: string;
  // QR Code HTML (optional - passed from digsig signing)
  qrCodeHtml?: string;
  bsreFooter?: boolean;
  // English format flag (untuk SDE)
  english?: boolean;
}

@Injectable()
export class GeneratePdfSudinService {
  async generatePdf(body: SdiPdfOptions): Promise<Buffer> {
    const result = await pdfQueue.add(() => this._generatePdfWithRetry(body), {
      timeout: 90000,
    });
    if (!result) {
      throw new Error('PDF generation timeout/empty result');
    }
    return Buffer.isBuffer(result) ? result : Buffer.from(result as any);
  }

  private isRecoverableBrowserError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
    return (
      message.includes('connection closed') ||
      message.includes('target closed') ||
      message.includes('session closed') ||
      message.includes('browser has disconnected') ||
      message.includes('protocol error')
    );
  }

  private async _generatePdfWithRetry(body: SdiPdfOptions): Promise<Buffer> {
    try {
      return await this._generatePdfInternal(body);
    } catch (error) {
      if (!this.isRecoverableBrowserError(error)) {
        throw error;
      }
      await resetBrowser();
      return this._generatePdfInternal(body);
    }
  }

  private async _generatePdfInternal(body: SdiPdfOptions): Promise<Buffer> {
    // Check if English format is requested
    const isEnglish = body.english === true;

    if (isEnglish) {
      return this._generatePdfEnglish(body);
    }

    return this._generatePdfIndonesian(body);
  }

  /**
   * Generate PDF dalam format Bahasa Inggris (untuk SDE)
   */
  private async _generatePdfEnglish(body: SdiPdfOptions): Promise<Buffer> {
    let logoBase64 = '';

    try {
      const possiblePaths = [
        path.resolve(__dirname, '../../../../public/logo_airnav.jpg'),
        path.resolve(process.cwd(), 'public/logo_airnav.jpg'),
        path.join(__dirname, '../../../../public/logo_airnav.jpg'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          logoBase64 = fs.readFileSync(logoPath, 'base64');
          break;
        }
      }
    } catch (error) {
      // Silently fail and use placeholder
    }

    const htmlContent = body.html || body.htmlContent;
    if (!htmlContent) {
      throw new Error('Missing required field: html or htmlContent');
    }

    let decodedContent = '';
    try {
      if (htmlContent.includes('<') && htmlContent.includes('>')) {
        decodedContent = htmlContent;
      } else if (/^[A-Za-z0-9+/=]+$/.test(htmlContent)) {
        const buffer = Buffer.from(htmlContent, 'base64');
        decodedContent = buffer.toString('utf-8');
      } else {
        decodedContent = htmlContent;
      }
    } catch (e) {
      decodedContent = htmlContent;
    }

    // Helper function untuk format tanggal ke format English (e.g., "December 29, 2025")
    const formatDateToEnglish = (dateInput: string): string => {
      if (!dateInput) return '';
      const trimmed = dateInput.trim();
      if (!trimmed) return '';

      const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];

      try {
        let dateObj: Date | null = null;

        // DD-MM-YYYY format
        if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
          const [day, month, year] = trimmed.split('-');
          dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
          );
        }
        // YYYY-MM-DD format
        else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          dateObj = new Date(trimmed + 'T00:00:00');
        }
        // DD/MM/YYYY format
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
          const [day, month, year] = trimmed.split('/');
          dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
          );
        }
        // Already has month name (Indonesian) - convert to English
        else if (
          /januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(
            trimmed,
          )
        ) {
          const indonesianMonths: { [key: string]: number } = {
            januari: 0,
            februari: 1,
            maret: 2,
            april: 3,
            mei: 4,
            juni: 5,
            juli: 6,
            agustus: 7,
            september: 8,
            oktober: 9,
            november: 10,
            desember: 11,
          };
          const match = trimmed.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
          if (match) {
            const day = parseInt(match[1]);
            const monthName = match[2].toLowerCase();
            const year = parseInt(match[3]);
            const monthIndex = indonesianMonths[monthName];
            if (monthIndex !== undefined) {
              return `${monthNames[monthIndex]} ${day}, ${year}`;
            }
          }
          return trimmed;
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
          const month = monthNames[dateObj.getMonth()];
          const day = dateObj.getDate();
          const year = dateObj.getFullYear();
          return `${month} ${day}, ${year}`;
        }

        return trimmed;
      } catch (e) {
        console.error(
          '[GeneratePdfSudin] Error formatting date to English:',
          e,
        );
        return trimmed;
      }
    };

    const html = decodedContent;
    const namaTempat = body.nama_tempat || 'Tangerang';

    let tanggalRaw = (body.tanggal || '').trim();
    if (!tanggalRaw) {
      const now = new Date();
      const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      tanggalRaw = `${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    } else {
      tanggalRaw = formatDateToEnglish(tanggalRaw);
    }

    const tanggal = tanggalRaw;
    const tanggalFormatted = `${namaTempat}, ${tanggal}`;

    const positionText = body.positionText || '';
    const toTitleCase = (s: string) =>
      s.replace(
        /\b\w+/g,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
      );
    const namaLengkap = toTitleCase(body.namaLengkap || '');
    const atasNama = (body.atasNama || '').trim();
    const perihal = body.perihal || '';
    const sifat = formatSifatLabel(body.sifat, 'en');
    const lampiranText = body.lampiran === '-' ? '-' : body.lampiran || '-';
    const nomor = resolveDocumentNumber(body);

    // Format penerima
    let penerimaArr: string[] = [];
    if (Array.isArray(body.penerima)) {
      penerimaArr = body.penerima;
    } else if (typeof body.penerima === 'string') {
      try {
        const parsed = JSON.parse(body.penerima);
        penerimaArr = Array.isArray(parsed) ? parsed : [body.penerima];
      } catch {
        penerimaArr = body.penerima ? [body.penerima] : [];
      }
    }

    // Format tembusan
    let tembusanArr: string[] = [];
    if (Array.isArray(body.tembusan)) {
      tembusanArr = body.tembusan;
    } else if (typeof body.tembusan === 'string') {
      try {
        const parsed = JSON.parse(body.tembusan);
        tembusanArr = Array.isArray(parsed) ? parsed : [body.tembusan];
      } catch {
        tembusanArr = body.tembusan ? [body.tembusan] : [];
      }
    }

    // Helper function untuk mengambil hanya position_text (sebelum " - ")
    const extractPositionText = (text: string): string => {
      if (!text) return '';
      // GM sudah diformat lengkap oleh service SDI: nama, jabatan, dan lokasi.
      // Jangan buang area/sub-area ketika template English mengambil penerima.
      if (/\b(?:general\s+manager|GM)\b/i.test(text)) return text.trim();
      const dashIndex = text.indexOf(' - ');
      return dashIndex !== -1
        ? text.substring(0, dashIndex).trim()
        : text.trim();
    };

    const penerimaExceedsLimit = penerimaArr.length > 5;
    const tembusanExceedsLimit = tembusanArr.length > 5;
    const needsAddressPage = penerimaExceedsLimit || tembusanExceedsLimit;

    // Process penerima (English) - hanya tampilkan position_text (sebelum " - ")
    let penerimaHtml = '';
    if (penerimaExceedsLimit) {
      penerimaHtml = 'Please See Attached Address List<br>';
    } else {
      if (penerimaArr.length > 1) {
        penerimaHtml =
          "<ol style='margin:0;padding-left:0;list-style-position:inside;'>";
        penerimaArr.forEach((item) => {
          penerimaHtml += `<li>${extractPositionText(item)}</li>`;
        });
        penerimaHtml += '</ol>';
      } else if (penerimaArr.length === 1) {
        penerimaHtml = extractPositionText(penerimaArr[0]) || '';
      }
    }

    // Process tembusan (English) - hanya tampilkan position_text (sebelum " - ")
    // Nomor hanya untuk daftar yang memuat lebih dari satu penerima.
    let tembusanHtml = '';
    if (tembusanExceedsLimit) {
      tembusanHtml = 'Please See Attached Address List';
    } else if (tembusanArr.length > 1) {
      tembusanHtml = "<ol style='margin:0;padding-left:0;list-style-position:inside;'>";
      tembusanArr.forEach((item) => {
        tembusanHtml += `<li>${extractPositionText(item)}</li>`;
      });
      tembusanHtml += '</ol>';
    } else if (tembusanArr.length === 1) {
      tembusanHtml = extractPositionText(tembusanArr[0]);
    }

    // Tembusan section English
    let tembusanKonten = '';
    if (tembusanHtml !== '') {
      tembusanKonten = `
        <table style="width:100%;margin-top:20px;">
          <tbody>
            <tr>
              <td style="vertical-align:top;padding:0;">Copy to:<br>${tembusanHtml}</td>
            </tr>
          </tbody>
        </table>`;
    }

    // Dynamic header info
    const headerKantor = body.headerKantor || 'Head Office of Perum LPPNPI';
    const headerGedung = body.headerGedung || 'AirNav Indonesia Building';
    const headerAlamat =
      body.headerAlamat ||
      'Jl. Ir. H. Juanda No. 1 Tangerang<br>Banten 15121 Indonesia<br>Phone : +62 21 55915000<br>www.airnavindonesia.co.id';

    // Header kop surat (English)
    const header = `
      <table width='100%' border='0' style='border-collapse:collapse;' cellpadding='2'>
        <tbody>
          <tr>
            <td style='width:10%;'>${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" style="width:100%;" />` : '<div style="width:100%;background:#e0e0e0;border:1px solid #999;"></div>'}</td>
            <td width='65%' style='vertical-align:bottom;'><b style='font-size:18px;'>AirNav Indonesia</b></td>
            <td style='font-size:9px; text-align:left;'>${headerKantor}<br>${headerGedung}<br>${headerAlamat}</td>
          </tr>
          <tr><td colspan='3' style='font-size:2px;'>&nbsp;</td></tr>
        </tbody>
      </table>
    `;

    // Header info surat (English)
    const headerInfo = `
      <table border="0" width="100%" style="margin-top:20px;">
        <tbody>
          <tr>
            <td colspan="3" style="padding-top:10px;">${tanggalFormatted}</td>
          </tr>
          <tr>
            <td colspan="3">
              <table style="margin-top:10px;" width="100%">
                <tbody>
                  <tr>
                    <td width="15%" valign="middle">Number</td>
                    <td width="3%" valign="middle">:</td>
                    <td valign="middle">${nomor}</td>
                  </tr>
                  <tr>
                    <td valign="top">Classification</td>
                    <td valign="top">:</td>
                    <td valign="top">${sifat}</td>
                  </tr>
                  <tr>
                    <td valign="top">Attachment</td>
                    <td valign="top">:</td>
                    <td valign="top">${lampiranText}</td>
                  </tr>
                  <tr>
                    <td valign="top">Subject</td>
                    <td valign="top">:</td>
                    <td valign="top">${perihal}</td>
                  </tr>
                  <tr>
                    <td colspan="3" valign="top" style="padding-top:15px;width:100%;">
                      Dear,<br>
                      <div style="width:100%;margin:0;padding:0;">
                        ${penerimaHtml}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    // Body konten
    const bodyKonten = `
      <div style="margin-top:20px;margin-bottom:20px;text-align:justify;">
        ${html}
      </div>
    `;

    // QR Code section
    const qrCodeHtml = body.qrCodeHtml || '';
    const bsreFooter = body.bsreFooter
      ? `<div style="margin-top:20px;font-size:9pt;line-height:1.25;text-align:left;">
          Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik<br>
          yang diterbitkan oleh Balai Besar Sertifikasi Elektronik (BSrE), Badan Siber dan Sandi Negara
        </div>`
      : '';

    // TTD section (English) - tanggal, jabatan, QR, lalu nama penandatangan.
    const ttd = `
      <table style="width:100%;margin-top:25px;">
        <tbody>
          <tr>
            <td style="width:50%;text-align:center;">
              ${tanggalFormatted}<br>
              ${atasNama ? `a.n ${atasNama}<br>` : ''}${positionText}<br>
              ${qrCodeHtml ? `<div style="margin: 10px 0;">${qrCodeHtml}</div>` : '<br><br><br><br><br>'}
              ${namaLengkap}
            </td>
            <td style="width:50%;"></td>
          </tr>
        </tbody>
      </table>
    `;

    // Global CSS
    const globalStyle = `
      <style>
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.5;
        }
        table {
          border-collapse: collapse;
        }
        td {
          vertical-align: top;
        }
      </style>
    `;

    const konten =
      globalStyle +
      header +
      headerInfo +
      bodyKonten +
      ttd +
      tembusanKonten +
      bsreFooter;

    // Generate address page if needed (English)
    let addressPageContent = '';
    if (needsAddressPage) {
      let penerimaListHtml = '';
      if (penerimaExceedsLimit) {
        penerimaListHtml = "<ol style='margin-top:0px;margin-left:0px;'>";
        penerimaArr.forEach((item) => {
          // Hanya tampilkan position_text (sebelum " - ")
          penerimaListHtml += `<li>${extractPositionText(item)}</li>`;
        });
        penerimaListHtml += '</ol>';
      }

      let tembusanListHtml = '';
      if (tembusanExceedsLimit) {
        tembusanListHtml = "<ol style='margin-top:0px;margin-left:0px;'>";
        tembusanArr.forEach((item) => {
          // Hanya tampilkan position_text (sebelum " - ")
          tembusanListHtml += `<li>${extractPositionText(item)}</li>`;
        });
        tembusanListHtml += '</ol>';
      }

      addressPageContent = `
        <div style="page-break-before: always; padding-top: 20px; font-family: 'Times New Roman', Times, serif;">
          <table style="margin: 0 auto; width: 90%; font-family: 'Times New Roman', Times, serif; margin-bottom: 30px;">
            <tr>
              <td style="width: 50%;">&nbsp;</td>
              <td style="width: 50%; text-align: right; vertical-align: top;">
                <div style="display: inline-block; text-align: left;">
                  Letter Attachment<br>
                  Letter Number : ${nomor}<br>
                  Letter Date : ${tanggalFormatted}
                </div>
              </td>
            </tr>
          </table>
          <table style="margin: 0 auto; width: 90%; font-family: 'Times New Roman', Times, serif;">
            ${
              penerimaExceedsLimit
                ? `<tr>
              <td style="vertical-align:top; padding-bottom:20px;">
                <b>TO :</b><br>
                ${penerimaListHtml}
              </td>
            </tr>`
                : ''
            }
            ${
              tembusanExceedsLimit
                ? `<tr>
              <td style="vertical-align:top;">
                <b>COPY TO :</b><br>
                ${tembusanListHtml}
              </td>
            </tr>`
                : ''
            }
          </table>
        </div>
      `;
    }

    const finalKonten = konten + addressPageContent;

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultTimeout(60000);
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (
          url.startsWith('data:') ||
          url.startsWith('about:blank') ||
          url.startsWith('blob:')
        ) {
          return request.continue();
        }
        return request.abort();
      });

      await page.setContent(finalKonten, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        timeout: 60000,
        margin: {
          top: '15mm',
          bottom: '20mm',
          left: '25mm',
          right: '20mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch {
        // noop
      }
    }
  }

  /**
   * Generate PDF dalam format Bahasa Indonesia (default)
   */
  private async _generatePdfIndonesian(body: SdiPdfOptions): Promise<Buffer> {
    let logoBase64 = '';

    try {
      // Try multiple possible paths
      const possiblePaths = [
        path.resolve(__dirname, '../../../../public/logo_airnav.jpg'),
        path.resolve(process.cwd(), 'public/logo_airnav.jpg'),
        path.join(__dirname, '../../../../public/logo_airnav.jpg'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          logoBase64 = fs.readFileSync(logoPath, 'base64');
          break;
        }
      }
    } catch (error) {
      // Silently fail and use placeholder
    }

    // Accept both 'html' and 'htmlContent' field names
    const htmlContent = body.html || body.htmlContent;
    if (!htmlContent) {
      throw new Error('Missing required field: html or htmlContent');
    }

    // Decode from base64 - but handle both base64-encoded and plain text
    let decodedContent = '';
    try {
      // Check if content already looks like HTML (contains HTML tags)
      if (htmlContent.includes('<') && htmlContent.includes('>')) {
        // Already plain HTML, no need to decode
        decodedContent = htmlContent;
      } else if (/^[A-Za-z0-9+/=]+$/.test(htmlContent)) {
        // Looks like base64, try to decode
        const buffer = Buffer.from(htmlContent, 'base64');
        decodedContent = buffer.toString('utf-8');
      } else {
        // Not base64 and not HTML, use as-is
        decodedContent = htmlContent;
      }
    } catch (e) {
      // If base64 decode fails, assume it's plain text already
      decodedContent = htmlContent;
    }

    // Helper function untuk format tanggal ke format Indonesia (e.g., "29 Desember 2025")
    const formatDateToIndonesian = (dateInput: string): string => {
      if (!dateInput) return '';
      const trimmed = dateInput.trim();
      if (!trimmed) return '';

      const monthNames = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];

      try {
        // Already in Indonesian format (e.g., "29 Desember 2025")
        if (
          /januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(
            trimmed,
          )
        ) {
          return trimmed; // Already formatted
        }

        let dateObj: Date | null = null;

        // DD-MM-YYYY format
        if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
          const [day, month, year] = trimmed.split('-');
          dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
          );
        }
        // YYYY-MM-DD format
        else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          dateObj = new Date(trimmed + 'T00:00:00');
        }
        // DD/MM/YYYY format
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
          const [day, month, year] = trimmed.split('/');
          dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
          );
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
          const day = dateObj.getDate();
          const month = monthNames[dateObj.getMonth()];
          const year = dateObj.getFullYear();
          return `${day} ${month} ${year}`;
        }

        return trimmed;
      } catch (e) {
        console.error('[GeneratePdfSudin] Error formatting date:', e);
        return trimmed;
      }
    };

    const html = decodedContent;
    const namaTempat = body.nama_tempat || 'Tangerang';
    // Format tanggal ke format Indonesia (e.g., "29 Desember 2025")
    let tanggalRaw = (body.tanggal || '').trim();
    console.log(
      '[GeneratePdfSudin] Input tanggal:',
      body.tanggal,
      '| tanggalRaw before:',
      tanggalRaw,
    );
    if (!tanggalRaw) {
      const now = new Date();
      const monthNames = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];
      tanggalRaw = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    } else {
      tanggalRaw = formatDateToIndonesian(tanggalRaw);
    }
    console.log('[GeneratePdfSudin] tanggalRaw after format:', tanggalRaw);
    const tanggal = tanggalRaw;
    const tanggalFormatted = `${namaTempat}, ${tanggal}`;
    console.log('[GeneratePdfSudin] tanggalFormatted:', tanggalFormatted);
    // Position and name from JWT user data (passed from controller)
    const positionText = body.positionText || '';
    const toTitleCase = (s: string) =>
      s.replace(
        /\b\w+/g,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
      );
    const namaLengkap = toTitleCase(body.namaLengkap || '');
    const atasNama = (body.atasNama || '').trim();
    const perihal = body.perihal || '';
    const sifat = formatSifatLabel(body.sifat);
    const lampiranText = body.lampiran || '-';
    const nomor = resolveDocumentNumber(body);

    // Format penerima - ensure it's an array
    let penerimaArr: string[] = [];
    if (Array.isArray(body.penerima)) {
      penerimaArr = body.penerima;
    } else if (typeof body.penerima === 'string') {
      try {
        const parsed = JSON.parse(body.penerima);
        penerimaArr = Array.isArray(parsed) ? parsed : [body.penerima];
      } catch {
        penerimaArr = body.penerima ? [body.penerima] : [];
      }
    }

    // Format tembusan - ensure it's an array
    let tembusanArr: string[] = [];
    if (Array.isArray(body.tembusan)) {
      tembusanArr = body.tembusan;
    } else if (typeof body.tembusan === 'string') {
      try {
        const parsed = JSON.parse(body.tembusan);
        tembusanArr = Array.isArray(parsed) ? parsed : [body.tembusan];
      } catch {
        tembusanArr = body.tembusan ? [body.tembusan] : [];
      }
    }

    // Check if address page is needed (>5 items)
    const penerimaExceedsLimit = penerimaArr.length > 5;
    const tembusanExceedsLimit = tembusanArr.length > 5;
    const needsAddressPage = penerimaExceedsLimit || tembusanExceedsLimit;

    // Process penerima
    let penerimaHtml = '';
    if (penerimaExceedsLimit) {
      // Jika penerima > 5, ganti dengan "Periksa Alamat Terlampir" (dengan line break sebelum "Di Tempat")
      penerimaHtml = 'Periksa Alamat Terlampir<br>';
    } else {
      // <= 5 items, tampilkan semua normal
      if (penerimaArr.length > 1) {
        penerimaHtml =
          "<ol style='margin:0;padding-left:0;list-style-position:inside;'>";
        penerimaArr.forEach((item) => {
          penerimaHtml += `<li>${item}</li>`;
        });
        penerimaHtml += '</ol>';
      } else if (penerimaArr.length === 1) {
        penerimaHtml = penerimaArr[0] || '';
      }
    }

    // Process tembusan
    // Nomor hanya untuk daftar yang memuat lebih dari satu penerima.
    let tembusanHtml = '';
    if (tembusanExceedsLimit) {
      // Jika tembusan > 5, ganti dengan "Periksa Alamat Terlampir"
      tembusanHtml = 'Periksa Alamat Terlampir';
    } else if (tembusanArr.length > 1) {
      tembusanHtml = "<ol style='margin:0;padding-left:0;list-style-position:inside;'>";
      tembusanArr.forEach((item) => {
        tembusanHtml += `<li>${item}</li>`;
      });
      tembusanHtml += '</ol>';
    } else if (tembusanArr.length === 1) {
      tembusanHtml = tembusanArr[0];
    }

    // Tembusan section (only show if tembusan exists)
    let tembusanKonten = '';
    if (tembusanHtml !== '') {
      tembusanKonten = `
        <table style="width:100%;margin-top:20px;">
          <tbody>
            <tr>
              <td style="vertical-align:top;padding:0;">Tembusan Yth:<br>${tembusanHtml}</td>
            </tr>
          </tbody>
        </table>`;
    }

    // Dynamic header info dari sub_area_alamat
    const headerKantor = body.headerKantor || 'Kantor Pusat Perum LPPNPI';
    const headerGedung = body.headerGedung || 'Gedung AirNav Indonesia';
    const headerAlamat =
      body.headerAlamat ||
      'Jl. Ir. H. Juanda No. 1 Tangerang<br>Banten 15121 Indonesia<br>Telp : 021-55915000<br>www.airnavindonesia.co.id';

    // Header kop surat
    const header = `
      <table width='100%' border='0' style='border-collapse:collapse;' cellpadding='2'>
        <tbody>
          <tr>
            <td style='width:10%;'>${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" style="width:100%;" />` : '<div style="width:100%;background:#e0e0e0;border:1px solid #999;"></div>'}</td>
            <td width='65%' style='vertical-align:bottom;'><b style='font-size:18px;'>AirNav Indonesia</b></td>
            <td style='font-size:9px; text-align:left;'>${headerKantor}<br>${headerGedung}<br>${headerAlamat}</td>
          </tr>
          <tr><td colspan='3' style='font-size:2px;'>&nbsp;</td></tr>
        </tbody>
      </table>
    `;

    // Header info surat
    const headerInfo = `
      <table border="0" width="100%" style="margin-top:20px;">
        <tbody>
          <tr>
            <td colspan="3" style="padding-top:10px;">${tanggalFormatted}</td>
          </tr>
          <tr>
            <td colspan="3">
              <table style="margin-top:10px;" width="100%">
                <tbody>
                  <tr>
                    <td width="15%" valign="middle">Nomor</td>
                    <td width="3%" valign="middle">:</td>
                    <td valign="middle">${nomor}</td>
                  </tr>
                  <tr>
                    <td valign="top">Sifat</td>
                    <td valign="top">:</td>
                    <td valign="top">${sifat}</td>
                  </tr>
                  <tr>
                    <td valign="top">Lampiran</td>
                    <td valign="top">:</td>
                    <td valign="top">${lampiranText}</td>
                  </tr>
                  <tr>
                    <td valign="top">Perihal</td>
                    <td valign="top">:</td>
                    <td valign="top">${perihal}</td>
                  </tr>
                  <tr>
                    <td colspan="3" valign="top" style="padding-top:15px;width:100%;">
                      Kepada Yth.<br>
                      <div style="width:100%;margin:0;padding:0;">
                        ${penerimaHtml}<br>
                        Di Tempat
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    // Body konten
    const bodyKonten = `
      <div style="margin-top:15px;text-align:justify;">
        ${html}
      </div>
    `;

    // QR Code section (optional - passed from digsig signing)
    const qrCodeHtml = body.qrCodeHtml || '';
    const bsreFooter = body.bsreFooter
      ? `<div style="margin-top:20px;font-size:9pt;line-height:1.25;text-align:left;">
          Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik<br>
          yang diterbitkan oleh Balai Besar Sertifikasi Elektronik (BSrE), Badan Siber dan Sandi Negara
        </div>`
      : '';

    // TTD section - tanggal, jabatan, QR, lalu nama penandatangan.
    const ttd = `
      <table style="width:100%;margin-top:25px;">
        <tbody>
          <tr>
            <td style="width:50%;text-align:left;">
              ${atasNama ? `a.n ${atasNama}<br>` : ''}${positionText}<br>
              ${qrCodeHtml ? `<div style="margin: 10px 0;">${qrCodeHtml}</div>` : '<br><br><br><br><br>'}
              ${namaLengkap}
            </td>
            <td style="width:50%;"></td>
          </tr>
        </tbody>
      </table>
    `;

    // Global CSS
    const globalStyle = `
      <style>
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.5;
        }
        table {
          border-collapse: collapse;
        }
        td {
          vertical-align: top;
        }
      </style>
    `;

    const konten =
      globalStyle +
      header +
      headerInfo +
      bodyKonten +
      ttd +
      tembusanKonten +
      bsreFooter;

    // Generate address page if needed (penerima or tembusan > 5)
    let addressPageContent = '';
    if (needsAddressPage) {
      // Build address list HTML - HANYA tampilkan field yang > 5
      let penerimaListHtml = '';
      if (penerimaExceedsLimit) {
        penerimaListHtml = "<ol style='margin-top:0px;margin-left:0px;'>";
        penerimaArr.forEach((item) => {
          penerimaListHtml += `<li>${item}</li>`;
        });
        penerimaListHtml += '</ol>';
      }

      let tembusanListHtml = '';
      if (tembusanExceedsLimit) {
        tembusanListHtml = "<ol style='margin-top:0px;margin-left:0px;'>";
        tembusanArr.forEach((item) => {
          tembusanListHtml += `<li>${item}</li>`;
        });
        tembusanListHtml += '</ol>';
      }

      addressPageContent = `
        <div style="page-break-before: always; padding-top: 20px; font-family: 'Times New Roman', Times, serif;">
          <table style="margin: 0 auto; width: 90%; font-family: 'Times New Roman', Times, serif; margin-bottom: 30px;">
            <tr>
              <td style="width: 50%;">&nbsp;</td>
              <td style="width: 50%; text-align: right; vertical-align: top;">
                <div style="display: inline-block; text-align: left;">
                  Lampiran Surat<br>
                  Nomor Surat : ${nomor}<br>
                  Tanggal Surat : ${tanggalFormatted}
                </div>
              </td>
            </tr>
          </table>
          <table style="margin: 0 auto; width: 90%; font-family: 'Times New Roman', Times, serif;">
            ${
              penerimaExceedsLimit
                ? `<tr>
              <td style="vertical-align:top; padding-bottom:20px;">
                <b>KEPADA YTH :</b><br>
                ${penerimaListHtml}
              </td>
            </tr>`
                : ''
            }
            ${
              tembusanExceedsLimit
                ? `<tr>
              <td style="vertical-align:top;">
                <b>TEMBUSAN :</b><br>
                ${tembusanListHtml}
              </td>
            </tr>`
                : ''
            }
          </table>
        </div>
      `;
    }

    const finalKonten = konten + addressPageContent;

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultTimeout(60000);
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (
          url.startsWith('data:') ||
          url.startsWith('about:blank') ||
          url.startsWith('blob:')
        ) {
          return request.continue();
        }
        return request.abort();
      });

      await page.setContent(finalKonten, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        timeout: 60000,
        margin: {
          top: '15mm',
          bottom: '20mm',
          left: '25mm',
          right: '20mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch {
        // noop
      }
    }
  }
}
