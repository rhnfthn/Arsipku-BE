import { Injectable } from '@nestjs/common';
import { getBrowser } from '../puppeteer.provider';
import * as fs from 'fs';
import * as path from 'path';
import { pdfQueue } from '../pdf.queue';

/**
 * Interface untuk body generate PDF Disposisi
 */
interface GeneratePdfDispoBody {
  html?: string;
  htmlContent?: string;
  penerima?: string[];
  disposisi?: string[];
  sifat?: string;
  pengirim?: string;
  tembusan?: string[];
  perihal?: string;
  refNomor?: string;
  refPerihal?: string;
  tanggal?: string;
  penandatangan?: string;
  catatan?: string;
}

@Injectable()
export class GeneratePdfDispoService {
  async generatePdf(body: GeneratePdfDispoBody): Promise<Buffer> {
    return pdfQueue.add(() => this._generatePdfInternal(body), {
      timeout: 30000,
    });
  }

  private async _generatePdfInternal(body: GeneratePdfDispoBody): Promise<Buffer> {
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
    // htmlContent is now optional - can be empty/null for disposisi without catatan
    const htmlContent = body.html || body.htmlContent || '';
    
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
    const penerima = body.penerima || [];
    const pengirim = body.pengirim || '';
    const sifat = body.sifat || 'Biasa';
    const penandatangan = body.penandatangan || '';
    
    // Format tanggal - convert dari YYYY-MM-DD atau DD/MM/YYYY ke format Indonesia
    let tanggal = body.tanggal || '';
    if (tanggal) {
      try {
        // Check if already in Indonesian format
        if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(tanggal)) {
          // Already formatted, keep as is
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
          // YYYY-MM-DD format
          const dateObj = new Date(tanggal + 'T00:00:00');
          if (!isNaN(dateObj.getTime())) {
            tanggal = dateObj.toLocaleDateString('id-ID', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
            });
          }
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(tanggal)) {
          // DD/MM/YYYY format
          const [day, month, year] = tanggal.split('/');
          const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          if (!isNaN(dateObj.getTime())) {
            tanggal = dateObj.toLocaleDateString('id-ID', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
            });
          }
        }
      } catch (e) {
        console.error('[GeneratePdfDispo] Error formatting date:', e);
      }
    }
    if (!tanggal) {
      tanggal = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    // Field referensi surat asal
    const refNomor = body.refNomor || '';
    const refPerihal = body.refPerihal || body.perihal || '';
    
    // Catatan untuk disposisi "Lainnya"
    const catatan = body.catatan || '';
    
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
    // Daftar lengkap semua pilihan disposisi (layout 3 kolom vertikal sesuai gambar)
    // Kolom 1 -> Kolom 2 -> Kolom 3, urutan dari atas ke bawah
    const disposisiOptions = [
      'Untuk Diketahui',        // Kolom 1 baris 1
      'Proses Lanjut',          // Kolom 2 baris 1
      'Koordinasikan',          // Kolom 3 baris 1
      'Cek',                    // Kolom 1 baris 2
      'Monitor',                // Kolom 2 baris 2
      'Evaluasi',               // Kolom 3 baris 2
      'Dikaji Kemungkinannya',  // Kolom 1 baris 3
      'Laporkan',               // Kolom 2 baris 3
      'Untuk Menjadi Perhatian', // Kolom 3 baris 3
      'Untuk Dijadikan Acuan/Dipergunakan', // Kolom 1 baris 4
      'Harap Mewakili',         // Kolom 2 baris 4
      'Harap Mendampingi',      // Kolom 3 baris 4
      'Tunjuk Perwakilan',      // Kolom 1 baris 5
      'Siapkan Bahan/Materi',   // Kolom 2 baris 5
      'Lainnya',                // Kolom 3 baris 5
    ];

    const disposisi = body.disposisi || [];
    const selectedDisposisi = Array.isArray(disposisi) ? disposisi : [];

    // Tampilkan semua pilihan, centang yang dipilih user
    const disposisiHtml = `
      <div style="
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        column-gap: 16px;
        row-gap: 8px;
      ">
        ${disposisiOptions.map(item => {
          const isChecked = selectedDisposisi.includes(item);
          return `
            <div style="display: flex; gap: 6px; align-items: flex-start;">
              <div style="
                width: 14px;
                height: 14px;
                border: 1px solid #000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                flex-shrink: 0;
              ">
                ${isChecked ? '✓' : ''}
              </div>
              <span style="font-size: 11px; line-height: 1.2;">
                ${item}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;

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
      <div style="border: 2px solid #000; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
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
              <div>Tgl: ${tanggal}</div>
            </div>
          </div>

          <!-- Detail Info -->
          <div style="width: 55%; border-right: 2px solid #000; padding: 12px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <tr style="border-bottom: none;">
                <td style="width: 70px; padding: 4px 0;">Surat dari</td>
                <td style="padding: 4px 0;">: ${pengirim}</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0;">Tanggal</td>
                <td style="padding: 4px 0;">: ${tanggal}</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0;">Nomor</td>
                <td style="padding: 4px 0;">: ${refNomor || '......................'}</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0; vertical-align: top;">Perihal</td>
                <td style="padding: 4px 0; vertical-align: top;">: ${refPerihal || '-'}</td>
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
            ${catatan || htmlCatatan || ''}
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
