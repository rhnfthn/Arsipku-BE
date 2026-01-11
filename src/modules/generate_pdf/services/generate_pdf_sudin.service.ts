import { Injectable } from '@nestjs/common';
import { getBrowser } from '../puppeteer.provider';
import * as fs from 'fs';
import * as path from 'path';
import { pdfQueue } from '../pdf.queue';

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
  nama_tempat?: string;
  nama_jabatan?: string;
  // Dynamic header info dari sub_area_alamat
  headerKantor?: string;
  headerGedung?: string;
  headerAlamat?: string;
  // QR Code HTML (optional - passed from digsig signing)
  qrCodeHtml?: string;
}

@Injectable()
export class GeneratePdfSudinService {
  async generatePdf(body: SdiPdfOptions): Promise<Buffer> {
    return pdfQueue.add(() => this._generatePdfInternal(body), {
      timeout: 30000,
    });
  }

  private async _generatePdfInternal(body: SdiPdfOptions): Promise<Buffer> {
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
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      
      try {
        // Already in Indonesian format (e.g., "29 Desember 2025")
        if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(trimmed)) {
          return trimmed; // Already formatted
        }
        
        let dateObj: Date | null = null;
        
        // DD-MM-YYYY format
        if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
          const [day, month, year] = trimmed.split('-');
          dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        // YYYY-MM-DD format
        else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          dateObj = new Date(trimmed + 'T00:00:00');
        }
        // DD/MM/YYYY format
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
          const [day, month, year] = trimmed.split('/');
          dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
    console.log('[GeneratePdfSudin] Input tanggal:', body.tanggal, '| tanggalRaw before:', tanggalRaw);
    if (!tanggalRaw) {
      const now = new Date();
      const monthNames = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
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
    const namaLengkap = body.namaLengkap || '';
    const perihal = body.perihal || '';
    const sifat = body.sifat || 'Biasa';
    const lampiranText = body.lampiran || '-';
    const nomor = body.nomor || '';
    
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
        penerimaHtml = "<ol style='margin-top:0px;margin-left:0px;margin-bottom:0px;padding-left:25px;'>";
        penerimaArr.forEach((item) => {
          penerimaHtml += `<li>${item}</li>`;
        });
        penerimaHtml += '</ol>';
      } else if (penerimaArr.length === 1) {
        penerimaHtml = penerimaArr[0] || '';
      }
    }
    
    // Process tembusan
    let tembusanHtml = '';
    if (tembusanExceedsLimit) {
      // Jika tembusan > 5, ganti dengan "Periksa Alamat Terlampir"
      tembusanHtml = 'Periksa Alamat Terlampir';
    } else {
      // <= 5 items, tampilkan semua normal
      if (tembusanArr.length > 1) {
        tembusanHtml = "<ol style='margin-top:0px;margin-left:0px;padding-left:25px;'>";
        tembusanArr.forEach((item) => {
          tembusanHtml += `<li>${item}</li>`;
        });
        tembusanHtml += '</ol>';
      } else if (tembusanArr.length === 1) {
        tembusanHtml = tembusanArr[0] || '';
      }
    }

    // Tembusan section (only show if tembusan exists)
    let tembusanKonten = '';
    if (tembusanHtml !== '') {
      tembusanKonten = `
        <table style="width:100%;margin-top:20px;">
          <tbody>
            <tr>
              <td style="vertical-align:top;">Tembusan Yth:<br>${tembusanHtml}</td>
            </tr>
          </tbody>
        </table>`;
    }

    // Dynamic header info dari sub_area_alamat
    const headerKantor = body.headerKantor || 'Kantor Pusat Perum LPPNPI';
    const headerGedung = body.headerGedung || 'Gedung AirNav Indonesia';
    const headerAlamat = body.headerAlamat || 'Jl. Ir. H. Juanda No. 1 Tangerang<br>Banten 15121 Indonesia<br>Telp : 021-55915000<br>www.airnavindonesia.co.id';

    // Header kop surat
    const header = `
      <table width='100%' border='0' style='border-collapse:collapse;' cellpadding='2'>
        <tbody>
          <tr>
            <td style='width:10%;'>${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" style="width:100%;" />` : '<div style="width:100%;background:#e0e0e0;border:1px solid #999;"></div>'}</td>
            <td width='65%' style='vertical-align:bottom;'><b style='font-size:18px;'>AirNav Indonesia</b></td>
            <td style='font-size:9px; text-align:right;'>${headerKantor}<br>${headerGedung}<br>${headerAlamat}</td>
          </tr>
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
                      <div style="width:55%;">
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

    // TTD section - dinamis dengan QR code di tengah
    const ttd = `
      <table style="width:100%;margin-top:30px;">
        <tbody>
          <tr>
            <td style="width:50%;"></td>
            <td style="text-align:center;">
              ${positionText}<br>
              ${qrCodeHtml ? `<div style="margin: 10px 0;">${qrCodeHtml}</div>` : '<br><br><br><br><br>'}
              ${namaLengkap}
            </td>
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

    const konten = globalStyle + header + headerInfo + bodyKonten + ttd + tembusanKonten;

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
            ${penerimaExceedsLimit ? `<tr>
              <td style="vertical-align:top; padding-bottom:20px;">
                <b>KEPADA YTH :</b><br>
                ${penerimaListHtml}
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
      await page.setContent(finalKonten, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          bottom: '20mm',
          left: '25mm',
          right: '20mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }
}
