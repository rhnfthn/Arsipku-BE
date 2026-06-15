import { Injectable } from '@nestjs/common';
import { getBrowser, resetBrowser } from '../puppeteer.provider';
import * as fs from 'fs';
import * as path from 'path';
import { pdfQueue } from '../pdf.queue';

interface NodinPdfOptions {
  html?: string;
  htmlContent?: string;
  filename?: string;
  dari?: string;
  tanggal?: string;
  tgl?: string;
  positionText?: string;
  namaLengkap?: string;
  penandatangan?: string;
  perihal?: string;
  tertuju?: string[];
  penerima?: string[];
  tembusan?: string[];
  nomor?: string;
  nama_tempat?: string;
  namaTempat?: string;
  sifat?: string;
  lampiran?: string;
  // Dynamic header info dari sub_area_alamat
  headerKantor?: string;
  headerGedung?: string;
  headerAlamat?: string;
  // QR Code HTML (optional - passed from digsig signing or preview)
  qrCodeHtml?: string;
}

@Injectable()
export class GeneratePdfNodinService {
  async generatePdf(body: NodinPdfOptions): Promise<Buffer> {
    const result = await pdfQueue.add(() => this._generatePdfWithRetry(body), {
      timeout: 90000,
    });
    if (!result) {
      throw new Error('PDF generation timeout/empty result');
    }
    return Buffer.isBuffer(result) ? result : Buffer.from(result as any);
  }

  private isRecoverableBrowserError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes('connection closed') ||
      message.includes('target closed') ||
      message.includes('session closed') ||
      message.includes('browser has disconnected') ||
      message.includes('protocol error')
    );
  }

  private async _generatePdfWithRetry(body: NodinPdfOptions): Promise<Buffer> {
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

  private async _generatePdfInternal(body: NodinPdfOptions): Promise<Buffer> {
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
    
    const html = decodedContent;
    
    // Support both 'penerima' (legacy) and 'tertuju' (new)
    const tertuju = body.tertuju || body.penerima || [];
    const tembusan = body.tembusan || [];
    const perihal = body.perihal || '';
    const dari = body.dari || '';
    const nomor = body.nomor || ''; // Nomor surat yang sudah di-generate
    
    // Support both old single field and new separate fields for signature
    const positionText = body.positionText || body.dari || '';
    const namaLengkap = body.namaLengkap || body.penandatangan || '';
    const namaTempat = body.nama_tempat || body.namaTempat || 'Tangerang';
    
    // Dynamic header info dari sub_area_alamat
    const headerKantor = body.headerKantor || 'Kantor Pusat Perum LPPNPI';
    const headerGedung = body.headerGedung || 'Gedung AirNav Indonesia';
    const headerAlamat = body.headerAlamat || 'Jl. Ir. H. Juanda No. 1 Tangerang<br>Banten 15121 Indonesia<br>Telp : 021-55915000<br>www.airnavindonesia.co.id';
    
    // Get tanggal from body (prioritas: tgl > tanggal > today)
    const tanggalInput = body.tgl || body.tanggal || new Date().toISOString().split('T')[0];
    
    // Format tanggal: "Tangerang, 19 Desember 2024"
    let tanggalFormatted = '';
    try {
      // Check if already formatted (contains month name in Indonesian)
      if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(tanggalInput)) {
        // Already formatted, just add nama_tempat if not exists
        if (tanggalInput.includes(',')) {
          tanggalFormatted = tanggalInput;
        } else {
          tanggalFormatted = `${namaTempat}, ${tanggalInput}`;
        }
      } else {
        // Parse as date (supports: YYYY-MM-DD, DD/MM/YYYY, ISO format, etc)
        // Add 'T00:00:00' to ensure correct parsing in local timezone
        const dateObj = new Date(tanggalInput + 'T00:00:00');
        
        if (!isNaN(dateObj.getTime())) {
          const formatted = dateObj.toLocaleDateString('id-ID', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            timeZone: 'Asia/Jakarta'
          });
          tanggalFormatted = `${namaTempat}, ${formatted}`;
        } else {
          // Fallback if parsing fails
          tanggalFormatted = `${namaTempat}, ${tanggalInput}`;
        }
      }
    } catch (error) {
      console.error('[generate_pdf_nodin] Error formatting date:', error);
      tanggalFormatted = `${namaTempat}, ${tanggalInput}`;
    }
    
    // Convert to arrays jika belum
    const tertujuArray = Array.isArray(tertuju) ? tertuju : [];
    const tembusanArray = Array.isArray(tembusan) ? tembusan : [];
    
    // Check masing-masing field terpisah
    const tertujuExceedsLimit = tertujuArray.length > 5;
    const tembusanExceedsLimit = tembusanArray.length > 5;
    const needsAddressPage = tertujuExceedsLimit || tembusanExceedsLimit;
    
    // Process tertuju
    let penerimaHtml = '';
    if (tertujuExceedsLimit) {
      // Jika tertuju > 5, SEMUA item diganti dengan "Periksa Alamat Terlampir"
      penerimaHtml = 'Periksa Alamat Terlampir';
    } else {
      // <= 5 items, tampilkan semua normal
      if (tertujuArray.length > 1) {
        penerimaHtml = "<ol style='margin-top:0px;margin-left:-20px;margin-bottom:0px;'>";
        tertujuArray.forEach((item) => {
          penerimaHtml += `<li>${item}</li>`;
        });
        penerimaHtml += '</ol>';
      } else if (tertujuArray.length === 1) {
        penerimaHtml = tertujuArray[0] || '';
      }
    }
    
    // Process tembusan
    let tembusanHtml = '';
    if (tembusanExceedsLimit) {
      // Jika tembusan > 5, SEMUA item diganti dengan "Periksa Alamat Terlampir"
      tembusanHtml = 'Periksa Alamat Terlampir';
    } else {
      // <= 5 items, tampilkan semua normal
      if (tembusanArray.length > 1) {
        tembusanHtml = "<ol style='margin-top:0px;margin-left:-20px;'>";
        tembusanArray.forEach((item) => {
          tembusanHtml += `<li>${item}</li>`;
        });
        tembusanHtml += '</ol>';
      } else if (tembusanArray.length === 1) {
        tembusanHtml = tembusanArray[0] || '';
      }
    }
    // console.log(tembusanHtml);
    const header = `
      <table width='100%' border='0' style='border-collapse:collapse;' cellpadding='2'>
        <tbody>
          <tr>
            <td style='width:10%;'>${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" style="width:100%;" />` : '<div style="width:100%;background:#e0e0e0;border:1px solid #999;"></div>'}</td>
            <td width='65%' style='vertical-align:bottom;'><b style='font-size:18px;'>AirNav Indonesia</b></td>
            <td style='font-size:9px; text-align:left;'>${headerKantor}<br>${headerGedung}<br>${headerAlamat}</td>
          </tr>
          <tr>
            <td colspan='3' style='font-size:2px;'>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    `;

    const header2 = `<table style="margin:auto;">
        <tbody><tr>
            <td align="center" style="padding-top:20px;">
            <b style="font-size:18px;"><u>N O T A &nbsp; D I N A S</u></b>
            <br>
            Nomor : ${nomor}</td>
        </tr>
        </tbody></table>`;
    const header3 = `<table style="margin:0 auto;width:65%;">
        <tbody><tr>
            <td width="120" style="width:30%;vertical-align:top;">Kepada Yth.</td>
            <td style="width:5%;text-align:center;vertical-align:top;">:</td>
            <td style="vertical-align:top;">${penerimaHtml}</td>
        </tr>
        <tr>
            <td style="vertical-align:top;">Dari</td><td style="vertical-align:top;width:10px;text-align:center;">:</td><td style="vertical-align:top;">${dari}</td>
        </tr>
        <tr>
            <td style="vertical-align:top;">Perihal</td><td style="vertical-align:top;width:10px;text-align:center;">:</td><td style="vertical-align:top;text-align:justify;">${perihal}</td>
        </tr>
        
        </tbody></table>`;

    // QR Code section (optional - passed from digsig signing)
    const qrCodeHtml = body.qrCodeHtml || '';
    
    const ttd = `<table style="margin:auto;width:90%;">
        <tbody><tr>
            <td style="width:50%;">
            </td>
            <td style="text-align:center;">
            ${tanggalFormatted}<br>
            ${positionText}<br>
            ${qrCodeHtml ? `<div style="margin: 10px 0;">${qrCodeHtml}</div>` : '<br><br><br><br><br>'}
            ${namaLengkap}</td>
        </tr>
        </tbody></table>`;

    // Show tembusan section jika ada tembusan (baik normal list atau "Periksa Alamat Terlampir")
    let tembusanKonten = '';
    if (tembusanArray.length > 0) {
      tembusanKonten = `<table style="margin:20px auto;width:100%;">
        <tbody><tr>
            <td>&nbsp;</td>
        </tr>
        <tr>
            <td>
            Tembusan Yth:<br>${tembusanHtml}</td>
        </tr>
        </tbody></table>`;
    }

    // Add global CSS untuk font dan border
    const globalStyle = `
      <style>
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.5;
        }
        table, th, td {
          font-family: 'Times New Roman', Times, serif;
        }
        /* Wrapper untuk body content dengan margin */
        .body-content {
          margin-top: 20px;
          margin-bottom: 20px;
          text-align: justify;
        }
        /* Wrapper untuk ttd dengan margin top */
        .ttd-wrapper {
          margin-top: 25px;
        }
      </style>
    `;

    // Wrap body content dengan margin
    const bodyContent = `<div class="body-content">${html}</div>`;
    
    // Wrap ttd dengan margin top
    const ttdWrapped = `<div class="ttd-wrapper">${ttd}</div>`;
    
    const konten = globalStyle + header + header2 + header3 + bodyContent + ttdWrapped + tembusanKonten;

    // Generate halaman alamat jika ada field yang > 5
    let addressPageContent = '';
    if (needsAddressPage) {
      // Build address list HTML - HANYA tampilkan field yang > 5
      let tertujuListHtml = '';
      if (tertujuExceedsLimit) {
        tertujuListHtml = "<ol style='margin-top:0px;margin-left:0px;'>";
        tertujuArray.forEach((item) => {
          tertujuListHtml += `<li>${item}</li>`;
        });
        tertujuListHtml += '</ol>';
      }

      let tembusanListHtml = '';
      if (tembusanExceedsLimit) {
        tembusanListHtml = "<ol style='margin-top:0px;margin-left:0px;'>";
        tembusanArray.forEach((item) => {
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
                  Nomor Surat :<br>
                  Tanggal Surat : ${tanggalFormatted}
                </div>
              </td>
            </tr>
          </table>
          <table style="margin: 0 auto; width: 90%; font-family: 'Times New Roman', Times, serif;">
            ${tertujuExceedsLimit ? `<tr>
              <td style="vertical-align:top; padding-bottom:20px;">
                <b>KEPADA YTH :</b><br>
                ${tertujuListHtml}
              </td>
            </tr>` : ''}
            ${tembusanExceedsLimit ? `<tr>
              <td style="vertical-align:top;">
                <b>TEMBUSAN :</b><br>
                ${tembusanListHtml}
              </td>
            </tr>` : ''}
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
        if (url.startsWith('data:') || url.startsWith('about:blank') || url.startsWith('blob:')) {
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

      // await browser.close();

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
