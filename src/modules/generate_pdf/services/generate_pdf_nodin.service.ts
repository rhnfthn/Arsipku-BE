import { Injectable } from '@nestjs/common';
import { getBrowser } from '../puppeteer.provider';
import * as fs from 'fs';
import * as path from 'path';
import { pdfQueue } from '../pdf.queue';

@Injectable()
export class GeneratePdfNodinService {
  async generatePdf(body: any): Promise<Buffer> {
    return pdfQueue.add(() => this._generatePdfInternal(body), {
      timeout: 30000,
    });
  }

  private async _generatePdfInternal(body: any): Promise<Buffer> {
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
      // Try to decode as base64 first
      const buffer = Buffer.from(htmlContent, 'base64');
      const decoded = buffer.toString('utf-8');
      // Check if it looks like valid decoded content (contains HTML tags or text)
      if (decoded.includes('<') || !htmlContent.match(/^[A-Za-z0-9+/=]+$/)) {
        // Looks like decoded content
        decodedContent = decoded;
      } else {
        // Try to decode with escape sequence handling
        decodedContent = decodeURIComponent(escape(decoded));
      }
    } catch (e) {
      // If base64 decode fails, assume it's plain text already
      decodedContent = htmlContent;
    }
    
    const html = decodedContent;
    
    // Support both 'penerima' (legacy) and 'tertuju' (new)
    const penerima = body.tertuju || body.penerima;
    const perihal = body.perihal || '';
    const dari = body.dari || '';
    const tanggal = body.tanggal || new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Support both old single field and new separate fields for signature
    const positionText = body.positionText || body.dari || '';
    const namaLengkap = body.namaLengkap || body.penandatangan || '';
    let penerimaHtml = '';
    if (penerima.length > 1) {
      penerimaHtml =
        "<ol style='margin-top:0px;margin-left:-20px;margin-bottom:0px;'>";
      penerima.forEach((item) => {
        penerimaHtml += `<li>${item}</li>`;
      });
      penerimaHtml += '</ol>';
    } else {
      penerimaHtml = penerima[0] || '';
    }
    const tembusandata = body.tembusan || [];

    let tembusanHtml = '';
    if (tembusandata.length > 1) {
      tembusanHtml = "<ol style='margin-top:0px;margin-left:-20px;'>";
      tembusandata.forEach((item) => {
        tembusanHtml += `<li>${item}</li>`;
      });
      tembusanHtml += '</ol>';
    } else {
      tembusanHtml = tembusandata[0] || '';
    }
    // console.log(tembusanHtml);
    const header = `
      <table width='100%' border='0' style='border-collapse:collapse;' cellpadding='2'>
        <tbody>
          <tr>
            <td width='10%'>${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" style="height: 48px; width: auto; max-width: 60px;" />` : '<div style="width:60px;height:48px;background:#e0e0e0;border:1px solid #999;"></div>'}</td>
            <td width='65%' style='vertical-align:bottom;'><b style='font-size:18px;'>AirNav Indonesia</b></td>
            <td style='font-size:13px;vertical-align:bottom!important;'>
              
              <span style='font-size:10px;line-height:11px;'>
                Kantor Pusat Perum LPPNPI
                Gedung AirNav Indonesia<br>
                Jl. Ir. H. Juanda No. 1 Tangerang<br>
                Banten 15121 Indonesia<br>
                Telp : 021-55915000<br>
                www.airnavindonesia.co.id
              </span>
            </td>
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
            Nomor :     </td>
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

    const ttd = `<table style="margin:auto;width:90%;">
        <tbody><tr>
            <td style="width:50%;">
            </td>
            <td style="text-align:center;">
            ${tanggal}<br>
            ${positionText}<br>  
                    <br>
                    <br>
                    <br>
                    ${namaLengkap}</td>
        </tr>
        </tbody></table>`;

    let tembusanKonten = '';
    if (tembusanHtml != '') {
      tembusanKonten = `<table style="margin:20px auto;width:100%;">
        <tbody><tr>
            <td>&nbsp;</td>
        </tr>
        <tr>
            <td>
            Tembusan Yth:<br>${tembusanHtml}</td>
        </tr>
        </tbody></table>`;
    } else {
      tembusanKonten = '';
    }

    const konten = header + header2 + header3 + html + ttd + tembusanKonten;

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(konten, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          bottom: '15mm',
          left: '15mm',
          right: '15mm',
        },
      });

      // await browser.close();

      return Buffer.from(pdf);
    } finally {
      await page.close(); // ✅ WAJIB
    }
  }
}
