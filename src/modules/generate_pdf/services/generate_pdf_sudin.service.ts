import { Injectable } from '@nestjs/common';
import { getBrowser } from '../puppeteer.provider';
import * as fs from 'fs';
import * as path from 'path';
import { pdfQueue } from '../pdf.queue';

@Injectable()
export class GeneratePdfSudinService {
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
    const dari = body.dari || 'Tangerang';
    const tanggal = body.tanggal || new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const penandatangan = body.penandatangan || 'Rizwan Noor Hasfrian';
    const perihal = body.perihal || '';
    const penerima = body.penerima || [];
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
      tembusanHtml = "<ol style='margin-top:0px;margin-left:0px;'>";
      tembusandata.forEach((item) => {
        tembusanHtml += `<li>${item}</li>`;
      });
      tembusanHtml += '</ol>';
    } else {
      tembusanHtml = tembusandata[0] || '';
    }
    // console.log(tembusanHtml);
    let tembusanKonten = '';
    if (tembusanHtml != '') {
      tembusanKonten = `<tr>
        <td colspan="3" style="padding-top:15px;">Tembusan Yth:</td>
      </tr>
      <tr>
        <td colspan="3">${tembusanHtml}</td>
      </tr>`;
    }

    const konten = `<table style="width:100%;margin:0 auto;">
      <tbody><tr>
        <td style="width:10%;"><img src="data:image/jpeg;base64,${logoBase64}" style="width:100%;"></td>
        <td style="width:70%;color:#000;font-size:18px;vertical-align:bottom;">
          AirNav Indonesia<br>
        </td>
        <td style="font-size:9px;">Kantor Pusat Perum LPPNPI<br>Gedung AirNav Indonesia<br>Jl. Ir. H. Juanda No. 1 Tangerang<br>Banten 15121 Indonesia<br>Telp : 021-55915000<br>www.airnavindonesia.co.id</td>
      </tr>
    </tbody></table>	

    <table border="0" width="96%" style="margin-top:20px;">
      <tbody><tr>
        <td colspan="3" style="padding-top:10px;">
          ${dari}, ${tanggal}		</td>
      </tr>
      <tr>
      <td colspan="3">
        <table style="margin-top:10px;" width="100%">
          <tbody><tr>
            <td width="20%" valign="middle">Nomor</td><td width="3%" valign="middle">:</td>
            <td valign="middle">
                      </td>
          </tr>
          <tr>
            <td valign="top">Sifat</td><td valign="top">:</td>
            <td valign="top">Biasa/ Terbuka</td>
          </tr>
          <tr>
            <td valign="top">Lampiran</td><td valign="top">:</td>
            <td valign="top">1 Lampiran</td>
          </tr>
          <tr>
            <td valign="top">Perihal</td><td valign="top">:</td>
            <td valign="top">${perihal}</td>
          </tr>
          <tr>
            <td colspan="3" valign="top" style="padding-top:15px;width:100%;">Kepada Yth.<br>
            <div style="width:55%;">
            ${penerimaHtml}
            Di Tempat</div>
            </td>
          </tr>
        </tbody></table>
      </td>
      </tr>
      <tr>
        <td colspan="3" style="overflow:hidden;">        
        ${html}		
        </td>
      </tr>
      <tr>
        <td colspan="3" style="padding-right:40px;">
          <table style="margin-top:0px;">
            <tbody><tr>
                    <td style="padding-top:0px;">
                    EVP of Information Technology</td>
                  </tr>
            <tr>
              <td height="60">
                  <br><br><br><br>					</td>
            </tr>
            <tr>
              <td style="">Rizwan Noor Hasfrian</td>
            </tr>
          </tbody></table>
        </td>
      </tr>
      ${tembusanKonten}      
      </tbody></table>`;

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
