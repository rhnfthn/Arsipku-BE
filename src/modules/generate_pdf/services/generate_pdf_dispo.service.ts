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
  nomorAgenda?: string; // Nomor agenda (diisi dengan nomor surat yang baru di-generate)
  refNomor?: string;
  refPerihal?: string;
  refTanggal?: string; // Tanggal surat referensi
  refPengirim?: string; // Pengirim surat referensi (surat dari)
  tanggal?: string; // Tanggal disposisi terkirim (untuk agenda)
  penandatangan?: string;
  catatan?: string;
  // QR Code HTML (optional - passed from digsig signing or preview)
  qrCodeHtml?: string;
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
      // Check if content already looks like HTML (contains HTML tags)
      if (htmlContent.includes('<') && htmlContent.includes('>')) {
        // Already plain HTML, no need to decode
        decodedContent = htmlContent;
      } else if (htmlContent && /^[A-Za-z0-9+/=]+$/.test(htmlContent)) {
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
    
    const htmlCatatan = decodedContent || '';
    const penerima = body.penerima || [];
    const pengirim = body.pengirim || '';

    const normalizeSifat = (value?: string): string => {
      if (!value) return 'biasa';
      return String(value).toLowerCase().trim().replace(/\s+/g, '_');
    };

    // Support variasi payload: biasa, terbatas, rahasia, sangat rahasia, sangat_rahasia.
    const sifatLabelMap: Record<string, string> = {
      biasa: 'Biasa',
      terbatas: 'Terbatas',
      rahasia: 'Rahasia',
      sangat_rahasia: 'Sangat Rahasia',
    };

    const normalizedSifat = normalizeSifat(body.sifat);
    const selectedSifatLabel = sifatLabelMap[normalizedSifat] || 'Biasa';
    const penandatangan = body.penandatangan || '';
    
    // Indonesian month names
    const monthNamesId = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    // Helper function untuk format tanggal ke format Indonesia "20 Desember 2025"
    const formatDateToIndonesian = (dateInput: string): string => {
      if (!dateInput) return '';
      const trimmed = dateInput.trim();
      if (!trimmed) return '';
      try {
        let dateObj: Date | null = null;
        
        // Already in DD-MM-YYYY format
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
        // Indonesian long format (e.g., "Selasa, 24 Desember 2024") - already in correct format
        else if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(trimmed)) {
          const match = trimmed.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (match) {
            return `${match[1]} ${match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase()} ${match[3]}`;
          }
          return trimmed;
        }
        
        if (dateObj && !isNaN(dateObj.getTime())) {
          const day = dateObj.getDate();
          const month = monthNamesId[dateObj.getMonth()];
          const year = dateObj.getFullYear();
          return `${day} ${month} ${year}`;
        }
        
        return trimmed; // Return as-is if format not recognized
      } catch (e) {
        console.error('[GeneratePdfDispo] Error formatting date:', e);
        return trimmed;
      }
    };

    // Format tanggal disposisi (untuk AGENDA) ke format Indonesia "20 Desember 2025"
    let tanggal = (body.tanggal || '').trim();
    console.log('[GeneratePdfDispo] Input tanggal:', body.tanggal, '| tanggal after trim:', tanggal);
    if (!tanggal) {
      const now = new Date();
      const day = now.getDate();
      const month = monthNamesId[now.getMonth()];
      const year = now.getFullYear();
      tanggal = `${day} ${month} ${year}`;
    } else {
      tanggal = formatDateToIndonesian(tanggal);
    }
    console.log('[GeneratePdfDispo] tanggal after format:', tanggal);
    
    // Field referensi surat asal (kolom kanan - data dari surat yang didisposisi)
    // Jika tidak ada ref_nomor dan ref_perihal, semua field referensi harus kosong
    const refNomor = body.refNomor || '';
    const refPerihal = body.refPerihal || '';
    const hasRefData = refNomor || refPerihal; // Cek apakah ada data referensi
    const refTanggal = hasRefData && body.refTanggal ? formatDateToIndonesian(body.refTanggal) : ''; // Tanggal surat referensi
    const refPengirim = hasRefData ? (body.refPengirim || '') : ''; // Pengirim surat referensi (surat dari)
    
    // Catatan untuk disposisi "Lainnya"
    const catatan = body.catatan || '';

    // QR Code section (optional - passed from digsig signing or preview)
    const qrCodeHtml = body.qrCodeHtml || '';
    
    // Format penerima - sort ascending dan hanya tampilkan position text (tanpa organisasi)
    // Jika format "Position - Organization", ambil hanya Position
    let sortedPenerima = [...penerima].sort((a, b) => a.localeCompare(b, 'id'));
    let penerimaHtml = '';
    if (Array.isArray(sortedPenerima) && sortedPenerima.length > 0) {
      // Extract only position text if format is "Position - Organization"
      const cleanPenerima = sortedPenerima.map(p => {
        if (p.includes(' - ')) {
          return p.split(' - ')[0].trim();
        }
        return p;
      });
      
      if (cleanPenerima.length === 1) {
        penerimaHtml = cleanPenerima[0];
      } else {
        penerimaHtml = cleanPenerima.map(p => `<div style="margin-left: 20px;">${p}</div>`).join('');
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
          ${item === selectedSifatLabel ? '✓' : ''}
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
          <!-- Agenda (Kiri) - Tanggal terkirim disposisi dari kita -->
          <div style="width: 15%; border-right: 2px solid #000; padding: 12px; display: flex; flex-direction: column;">
            <div style="font-weight: bold; text-decoration: underline; margin-bottom: 12px;">AGENDA</div>
            <div style="font-size: 10px; font-weight: bold; display: flex; flex-direction: column; gap: 8px;">
              <div>No: ${body.nomorAgenda || '........'}</div>
              <div>Tgl: ${tanggal}</div>
            </div>
          </div>

          <!-- Detail Info (Tengah) - Data dari referensi surat yang didisposisi -->
          <div style="width: 55%; border-right: 2px solid #000; padding: 12px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <tr style="border-bottom: none;">
                <td style="width: 70px; padding: 4px 0;">Surat dari</td>
                <td style="padding: 4px 0;">: ${refPengirim || '-'}</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0;">Tanggal</td>
                <td style="padding: 4px 0;">: ${refTanggal || '-'}</td>
              </tr>
              <tr style="border-bottom: none;">
                <td style="padding: 4px 0;">Nomor</td>
                <td style="padding: 4px 0;">: ${refNomor || '-'}</td>
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
        <div style="border-bottom: 2px solid #000; min-height: 280px; display: flex; flex-direction: column;">
          <div style="padding: 8px 12px; font-weight: bold; font-size: 11px; text-decoration: underline; background-color: #f3f3f3; border-bottom: 1px solid #ddd;">CATATAN :</div>
          <div style="padding: 12px; font-size: 10px; flex: 1;">
            ${catatan || htmlCatatan || ''}
          </div>
          ${qrCodeHtml ? `<div style="display: flex; justify-content: flex-end; padding: 12px;"><div style="margin: 10px 0;">${qrCodeHtml}</div></div>` : ''}
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
          top: '30mm',
          bottom: '20mm',
          left: '25mm',
          right: '20mm',
        },
      });

      // await browser.close();

      return Buffer.from(pdf);
    } finally {
      await page.close(); // ✅ WAJIB
    }
  }
}
