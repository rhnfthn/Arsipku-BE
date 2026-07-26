import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';

export interface QRCodeData {
  signature_id: string;
  document_number: string;
  signed_at: string;
  signer_name: string;
  signer_jabatan: string;
  document_type: string;
  verification_url?: string;
  pdf_url?: string; // URL langsung ke final PDF
}

@Injectable()
export class QRCodeService {
  private logoBase64: string | null = null;

  constructor() {
    // Load logo AirNav saat service di-initialize
    this.loadLogo();
  }

  /**
   * Load logo AirNav dari file
   */
  private loadLogo(): void {
    try {
      const possiblePaths = [
        path.resolve(__dirname, '../../../../public/logo_airnav.jpg'),
        path.resolve(process.cwd(), 'public/logo_airnav.jpg'),
        path.join(__dirname, '../../../../public/logo_airnav.jpg'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          this.logoBase64 = fs.readFileSync(logoPath, 'base64');
          console.log('[QRCodeService] Logo AirNav loaded successfully');
          break;
        }
      }
    } catch (error) {
      console.error('[QRCodeService] Failed to load logo:', error);
    }
  }

  /**
   * Generate QR Code dengan logo AirNav di tengah sebagai base64 data URL
   */
  async generateQRCodeBase64(data: QRCodeData): Promise<string> {
    // Data yang akan di-encode dalam QR code (URL ke PDF)
    const qrContent = this.formatQRContent(data);

    // Generate QR code sebagai data URL dengan error correction High untuk logo
    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'H', // High untuk support logo di tengah
      type: 'image/png',
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // Jika ada logo, tambahkan di tengah QR code
    if (this.logoBase64) {
      try {
        return await this.addLogoToQRCode(qrDataUrl);
      } catch (error) {
        console.error('[QRCodeService] Failed to add logo to QR:', error);
        return qrDataUrl; // Return QR tanpa logo jika gagal
      }
    }

    return qrDataUrl;
  }

  /**
   * Tambahkan logo di tengah QR code
   */
  private async addLogoToQRCode(qrDataUrl: string): Promise<string> {
    const qrSize = 200;
    const logoSize = 50; // Logo 25% dari QR code

    // Buat canvas
    const canvas = createCanvas(qrSize, qrSize);
    const ctx = canvas.getContext('2d');

    // Load QR code image
    const qrImage = await loadImage(qrDataUrl);
    ctx.drawImage(qrImage, 0, 0, qrSize, qrSize);

    // Load dan gambar logo di tengah
    if (this.logoBase64) {
      const logoImage = await loadImage(
        `data:image/jpeg;base64,${this.logoBase64}`,
      );

      // Posisi logo di tengah
      const logoX = (qrSize - logoSize) / 2;
      const logoY = (qrSize - logoSize) / 2;

      // Gambar background putih untuk logo (agar QR code tidak mengganggu)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10);

      // Gambar logo
      ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
    }

    // Convert canvas ke data URL
    return canvas.toDataURL('image/png');
  }

  /**
   * Generate QR Code sebagai Buffer PNG
   */
  async generateQRCodeBuffer(data: QRCodeData): Promise<Buffer> {
    const qrContent = this.formatQRContent(data);

    const buffer = await QRCode.toBuffer(qrContent, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 200,
      margin: 1,
    });

    return buffer;
  }

  /**
   * Generate QR Code dengan logo sebagai PNG Buffer untuk pdf-lib
   * Ini menggunakan canvas untuk menambahkan logo di tengah
   */
  async generateQRCodePngBuffer(data: QRCodeData): Promise<Buffer> {
    const qrContent = this.formatQRContent(data);
    const qrSize = 200;
    const logoSize = 50;

    // Generate QR code sebagai data URL
    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: qrSize,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // Buat canvas
    const canvas = createCanvas(qrSize, qrSize);
    const ctx = canvas.getContext('2d');

    // Load QR code image
    const qrImage = await loadImage(qrDataUrl);
    ctx.drawImage(qrImage, 0, 0, qrSize, qrSize);

    // Load dan gambar logo di tengah jika ada
    if (this.logoBase64) {
      try {
        const logoImage = await loadImage(
          `data:image/jpeg;base64,${this.logoBase64}`,
        );

        // Posisi logo di tengah
        const logoX = (qrSize - logoSize) / 2;
        const logoY = (qrSize - logoSize) / 2;

        // Gambar background putih untuk logo
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10);

        // Gambar logo
        ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
      } catch (error) {
        console.error('[QRCodeService] Failed to add logo:', error);
      }
    }

    // Convert canvas ke Buffer PNG
    return canvas.toBuffer('image/png');
  }

  /**
   * Format data untuk di-encode dalam QR code
   * Prioritas: pdf_url > verification_url > JSON data
   */
  private formatQRContent(data: QRCodeData): string {
    // Prioritas 1: URL langsung ke PDF
    if (data.pdf_url) {
      return data.pdf_url;
    }

    // Prioritas 2: URL verifikasi
    if (data.verification_url) {
      return data.verification_url;
    }

    // Prioritas 3: JSON data untuk verifikasi manual
    const verificationData = {
      sig: data.signature_id,
      doc: data.document_number,
      date: data.signed_at,
      by: data.signer_name,
      type: data.document_type,
    };

    return JSON.stringify(verificationData);
  }

  /**
   * Generate HTML untuk section QR code pada PDF
   */
  generateQRCodeHtml(qrDataUrl: string, data: QRCodeData): string {
    const signedDate = new Date(data.signed_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
      <div style="margin-top: 20px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; display: inline-block;">
        <table style="border-collapse: collapse;">
          <tr>
            <td style="padding-right: 15px; vertical-align: top;">
              <img src="${qrDataUrl}" style="width: 120px; height: 120px;" />
            </td>
            <td style="font-size: 9pt; vertical-align: top; line-height: 1.4;">
              <b>Dokumen ini telah ditandatangani secara elektronik</b><br>
              <span style="color: #666;">
                ID Signature: ${data.signature_id}<br>
                Tanggal: ${signedDate}<br>
                Penandatangan: ${data.signer_name}<br>
                Jabatan: ${data.signer_jabatan}
              </span>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /**
   * Generate Preview QR Code dengan text "PREVIEW" di tengah
   * Ukuran sama dengan QR code asli agar layout konsisten saat preview
   */
  async generatePreviewQRCodeBase64(): Promise<string> {
    const qrSize = 200;
    const canvas = createCanvas(qrSize, qrSize);
    const ctx = canvas.getContext('2d');

    // Background putih
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, qrSize, qrSize);

    // Border kotak (simulate QR code appearance)
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, qrSize - 10, qrSize - 10);

    // Pattern kotak-kotak untuk simulate QR code pattern
    ctx.fillStyle = '#E0E0E0';
    const boxSize = 10;
    for (let i = 0; i < qrSize / boxSize; i++) {
      for (let j = 0; j < qrSize / boxSize; j++) {
        if ((i + j) % 3 === 0) {
          ctx.fillRect(
            i * boxSize + 10,
            j * boxSize + 10,
            boxSize - 2,
            boxSize - 2,
          );
        }
      }
    }

    // Background putih di tengah untuk logo/text
    const centerBoxSize = 80;
    const centerX = (qrSize - centerBoxSize) / 2;
    const centerY = (qrSize - centerBoxSize) / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(centerX, centerY, centerBoxSize, centerBoxSize);

    // Load dan gambar logo di tengah jika ada
    if (this.logoBase64) {
      try {
        const logoSize = 50;
        const logoImage = await loadImage(
          `data:image/jpeg;base64,${this.logoBase64}`,
        );
        const logoX = (qrSize - logoSize) / 2;
        const logoY = (qrSize - logoSize) / 2 - 10;
        ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
      } catch (error) {
        console.error(
          '[QRCodeService] Failed to add logo to preview QR:',
          error,
        );
      }
    }

    // Text "PREVIEW" di bawah logo
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PREVIEW', qrSize / 2, qrSize / 2 + 30);

    return canvas.toDataURL('image/png');
  }

  /**
   * Generate Preview QR Code HTML untuk digunakan di preview PDF
   * Menghasilkan HTML img tag dengan ukuran yang sama dengan QR code final
   */
  async generatePreviewQRCodeHtml(): Promise<string> {
    const previewQrBase64 = await this.generatePreviewQRCodeBase64();
    return `<img src="${previewQrBase64}" style="width: 80px; height: 80px;" alt="Preview QR Code" />`;
  }
}
