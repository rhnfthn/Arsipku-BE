import { Injectable } from '@nestjs/common';
import { getBrowser } from '../puppeteer.provider';
import * as fs from 'fs';
import * as path from 'path';
import { pdfQueue } from '../pdf.queue';

@Injectable()
export class GeneratePdfDispoService {
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
    
    const htmlCatatan = decodedContent || '';
    const perihal = body.perihal || '';
    const penerima = body.penerima || [];
    const pengirim = body.pengirim || '';
    const sifat = body.sifat || 'Biasa';
    const tanggal = body.tanggal || new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const penandatangan = body.penandatangan || '';
    
    // Format penerima
    let penerimaHtml = '';
    if (Array.isArray(penerima) && penerima.length > 0) {
      if (penerima.length === 1) {
        penerimaHtml = penerima[0];
      } else {
        penerimaHtml = penerima.map(p => `<div style="margin-left: 20px;">${p}</div>`).join('');
      }
    }

    // Format disposisi dengan checkboxes
    const disposisi = body.disposisi || [];
    let disposisiHtml = '';
    if (Array.isArray(disposisi) && disposisi.length > 0) {
      disposisiHtml = disposisi.map(item => `
        <div style="display: inline-block; width: 32%; margin-right: 8px; margin-bottom: 8px; vertical-align: top;">
          <div style="display: flex; gap: 4px; align-items: flex-start;">
            <div style="width: 16px; height: 16px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0;">✓</div>
            <span style="font-size: 11px; line-height: 1.2;">${item}</span>
          </div>
        </div>
      `).join('');
    }

    // Format klasifikasi (Biasa, Terbatas, Rahasia, Sangat Rahasia)
    const array_sifat = ['Biasa', 'Terbatas', 'Rahasia', 'Sangat Rahasia'];
    let sifatsHtml = array_sifat.map(item => `
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
        <div style="width: 16px; height: 16px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px;">
          ${item === sifat ? '✓' : ''}
        </div>
        <span style="font-size: 11px;">${item}</span>
      </div>
    `).join('');

    const konten = `
      <div style="border: 2px solid #000; font-family: Arial, sans-serif; font-size: 12px;">
        <!-- Header Section -->
        <div style="display: flex; border-bottom: 2px solid #000;">
          <div style="width: 66.6%; padding: 12px; display: flex; align-items: center; gap: 16px; border-right: 2px solid #000;">
            ${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" style="height: 48px; width: auto; max-width: 60px;" />` : '<div style="width:60px;height:48px;background:#e0e0e0;border:1px solid #999;"></div>'}
            <span style="font-weight: bold; font-size: 16px; letter-spacing: 1px;">AirNav Indonesia</span>
          </div>
          <div style="width: 33.3%; padding: 12px; display: flex; flex-direction: column; justify-content: center; text-align: center; font-weight: bold; font-size: 11px;">
            <div>LEMBAR DISPOSISI</div>
            <div style="text-transform: uppercase; margin-top: 4px;">${pengirim}</div>
          </div>
        </div>

        <!-- Info Section -->
        <div style="display: flex; border-bottom: 2px solid #000;">
          <!-- Agenda -->
          <div style="width: 15%; border-right: 2px solid #000; padding: 12px; display: flex; flex-direction: column;">
            <div style="font-weight: bold; text-decoration: underline; margin-bottom: 12px;">AGENDA</div>
            <div style="font-size: 10px; font-weight: bold; display: flex; flex-direction: column; gap: 8px;">
              <div>No: ........</div>
              <div>Tgl: ........</div>
            </div>
          </div>

          <!-- Detail Info -->
          <div style="width: 55%; border-right: 2px solid #000; padding: 12px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <tr style="border-bottom: none;">
                <td style="width: 60px; padding: 4px 0;">Surat dari</td>
                <td style="padding: 4px 0;">: ${pengirim}</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0;">Tanggal</td>
                <td style="padding: 4px 0;">: ${tanggal}</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0;">Nomor</td>
                <td style="padding: 4px 0;">: ......................</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0; vertical-align: top;">Perihal</td>
                <td style="padding: 4px 0; vertical-align: top;">: ${perihal}</td>
              </tr>
            </table>
          </div>

          <!-- Klasifikasi -->
          <div style="width: 30%; padding: 12px;">
            <div style="font-weight: bold; text-decoration: underline; margin-bottom: 8px;">KLASIFIKASI</div>
            <div style="font-size: 11px;">
              ${sifatsHtml}
            </div>
          </div>
        </div>

        <!-- Kepada Yth Section -->
        <div style="border-bottom: 2px solid #000; padding: 12px; font-size: 11px;">
          <div style="font-weight: bold; text-decoration: underline; margin-bottom: 8px;">Kepada Yth. :</div>
          <div style="margin-left: 16px;">
            ${penerimaHtml}
          </div>
        </div>

        <!-- Disposisi Section -->
        <div style="border-bottom: 2px solid #000; padding: 12px; font-size: 11px; display: flex;">
          <div style="width: 80px; font-weight: bold; text-decoration: underline; flex-shrink: 0;">DISPOSISI :</div>
          <div style="flex: 1;">
            ${disposisiHtml}
            <div style="clear: both;"></div>
          </div>
        </div>

        <!-- Catatan Section -->
        <div style="border-bottom: 2px solid #000; min-height: 280px; position: relative;">
          <div style="padding: 8px 12px; font-weight: bold; font-size: 11px; text-decoration: underline; background-color: #f3f3f3; border-bottom: 1px solid #ddd;">CATATAN :</div>
          <div style="padding: 12px; font-size: 10px; min-height: 240px; position: relative;">
            ${htmlCatatan}
          </div>
          <div style="position: absolute; bottom: 12px; right: 12px; border: 2px solid #000; width: 96px; height: 64px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; background-color: rgba(255,255,255,0.8);">
            Paraf
          </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 2px solid #000; padding: 8px 12px; font-size: 9px; font-weight: bold; text-align: center; background-color: #f9f9f9;">
          Lembar disposisi ini menjadi bagian yang tidak terpisahkan dari nomor dan tanggal surat pada agenda ini.
        </div>
      </div>
    `;

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
