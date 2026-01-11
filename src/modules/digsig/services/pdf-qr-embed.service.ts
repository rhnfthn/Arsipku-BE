import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { QRCodeService, QRCodeData } from './qrcode.service';

/**
 * Interface untuk konfigurasi posisi QR Code
 */
export interface QRPositionConfig {
  // Jarak dari kanan halaman (dalam points, 1 inch = 72 points)
  rightMargin?: number;
  // Jarak dari bawah halaman (dalam points)
  bottomMargin?: number;
  // Ukuran QR code (dalam points)
  qrSize?: number;
  // Page number (0-indexed, default: 0 = halaman pertama)
  pageIndex?: number;
  // Apakah mencari placeholder atau menggunakan posisi fixed
  useFixedPosition?: boolean;
  // Posisi X fixed (dari kiri)
  fixedX?: number;
  // Posisi Y fixed (dari bawah)
  fixedY?: number;
}

/**
 * Interface untuk hasil embed QR
 */
export interface EmbedQRResult {
  success: boolean;
  pdfBuffer: Buffer;
  message: string;
  qrPosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
  };
}

/**
 * Service untuk embed QR Code ke PDF menggunakan pdf-lib
 * Best Practice: 
 * 1. Tidak regenerate template, hanya embed QR ke PDF yang sudah ada
 * 2. QR posisi dinamis berdasarkan TTD section
 * 3. Preserve lampiran yang sudah ter-merge
 */
@Injectable()
export class PdfQrEmbedService {
  constructor(private readonly qrCodeService: QRCodeService) {}

  /**
   * Embed QR Code ke PDF yang sudah ada
   * 
   * Strategy:
   * 1. Load PDF yang sudah final (dengan lampiran ter-merge)
   * 2. Find TTD section position (halaman terakhir sebelum lampiran, atau halaman pertama)
   * 3. Embed QR code di posisi tengah TTD section
   * 4. Return modified PDF buffer
   * 
   * @param pdfBuffer - Buffer PDF original
   * @param qrData - Data untuk generate QR code
   * @param config - Konfigurasi posisi QR (optional)
   */
  async embedQRCodeToPdf(
    pdfBuffer: Buffer,
    qrData: QRCodeData,
    config?: QRPositionConfig,
  ): Promise<EmbedQRResult> {
    try {
      // Default config
      const defaultConfig: QRPositionConfig = {
        rightMargin: 100,    // ~1.4 inch dari kanan
        bottomMargin: 150,   // ~2 inch dari bawah
        qrSize: 70,          // ~1 inch QR size
        pageIndex: 0,        // Halaman pertama (sebelum lampiran)
        useFixedPosition: false,
      };

      const finalConfig = { ...defaultConfig, ...config };

      // 1. Load PDF
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();

      if (pages.length === 0) {
        return {
          success: false,
          pdfBuffer: pdfBuffer,
          message: 'PDF tidak memiliki halaman',
        };
      }

      // 2. Determine target page (halaman utama surat, sebelum lampiran)
      // Biasanya halaman pertama untuk SDI, atau bisa dikonfigurasi
      const targetPageIndex = Math.min(finalConfig.pageIndex || 0, pages.length - 1);
      const targetPage = pages[targetPageIndex];
      const { width: pageWidth, height: pageHeight } = targetPage.getSize();

      // 3. Generate QR Code PNG buffer
      const qrPngBuffer = await this.qrCodeService.generateQRCodePngBuffer(qrData);
      const qrImage = await pdfDoc.embedPng(qrPngBuffer);

      // 4. Calculate QR position
      // Default: Posisi di kanan bawah area TTD (sekitar 2/3 dari kanan, 1/4 dari bawah)
      let qrX: number;
      let qrY: number;
      const qrSize = finalConfig.qrSize || 70;

      if (finalConfig.useFixedPosition && finalConfig.fixedX !== undefined && finalConfig.fixedY !== undefined) {
        // Gunakan posisi fixed
        qrX = finalConfig.fixedX;
        qrY = finalConfig.fixedY;
      } else {
        // Kalkulasi posisi dinamis untuk TTD section
        // TTD section biasanya di kanan bawah, center horizontal di area kanan
        // Posisi X: sekitar 2/3 dari lebar halaman (center di area kanan)
        qrX = (pageWidth * 2 / 3) - (qrSize / 2);
        
        // Posisi Y: sekitar 120-180 points dari bawah (area TTD)
        // Adjust berdasarkan bottomMargin config
        qrY = finalConfig.bottomMargin || 150;
      }

      // 5. Embed QR ke PDF
      targetPage.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });

      // 6. Save dan return
      const modifiedPdfBytes = await pdfDoc.save();

      return {
        success: true,
        pdfBuffer: Buffer.from(modifiedPdfBytes),
        message: 'QR Code berhasil di-embed ke PDF',
        qrPosition: {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
          page: targetPageIndex,
        },
      };
    } catch (error) {
      console.error('[PdfQrEmbedService] Error embedding QR:', error);
      return {
        success: false,
        pdfBuffer: pdfBuffer,
        message: `Gagal embed QR: ${error.message}`,
      };
    }
  }

  /**
   * Embed QR Code dengan signature text ke PDF
   * Menambahkan text info signature di bawah QR code
   * 
   * @param pdfBuffer - Buffer PDF original  
   * @param qrData - Data untuk generate QR code
   * @param config - Konfigurasi posisi
   */
  async embedQRCodeWithText(
    pdfBuffer: Buffer,
    qrData: QRCodeData,
    config?: QRPositionConfig,
  ): Promise<EmbedQRResult> {
    try {
      const defaultConfig: QRPositionConfig = {
        rightMargin: 100,
        bottomMargin: 150,
        qrSize: 70,
        pageIndex: 0,
        useFixedPosition: false,
      };

      const finalConfig = { ...defaultConfig, ...config };

      // 1. Load PDF
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();

      if (pages.length === 0) {
        return {
          success: false,
          pdfBuffer: pdfBuffer,
          message: 'PDF tidak memiliki halaman',
        };
      }

      // 2. Get target page
      const targetPageIndex = Math.min(finalConfig.pageIndex || 0, pages.length - 1);
      const targetPage = pages[targetPageIndex];
      const { width: pageWidth } = targetPage.getSize();

      // 3. Generate QR Code PNG buffer
      const qrPngBuffer = await this.qrCodeService.generateQRCodePngBuffer(qrData);
      const qrImage = await pdfDoc.embedPng(qrPngBuffer);

      // 4. Calculate position
      const qrSize = finalConfig.qrSize || 70;
      let qrX: number;
      let qrY: number;

      if (finalConfig.useFixedPosition && finalConfig.fixedX !== undefined && finalConfig.fixedY !== undefined) {
        qrX = finalConfig.fixedX;
        qrY = finalConfig.fixedY;
      } else {
        // Center di area TTD (kanan halaman)
        qrX = (pageWidth * 2 / 3) - (qrSize / 2);
        qrY = finalConfig.bottomMargin || 150;
      }

      // 5. Embed QR
      targetPage.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });

      // 6. Embed font untuk text
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = 6;

      // 7. Save dan return
      const modifiedPdfBytes = await pdfDoc.save();

      return {
        success: true,
        pdfBuffer: Buffer.from(modifiedPdfBytes),
        message: 'QR Code dengan text berhasil di-embed ke PDF',
        qrPosition: {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
          page: targetPageIndex,
        },
      };
    } catch (error) {
      console.error('[PdfQrEmbedService] Error embedding QR with text:', error);
      return {
        success: false,
        pdfBuffer: pdfBuffer,
        message: `Gagal embed QR: ${error.message}`,
      };
    }
  }

  /**
   * Generate QR Code simple (tanpa digital signature)
   * Untuk opsi 'qr_only' - hanya QR code info dokumen tanpa signature
   */
  generateSimpleQRData(params: {
    documentNumber: string;
    documentType: string;
    perihal: string;
    tanggal: string;
    signerName: string;
    signerJabatan: string;
    pdfUrl?: string;
  }): QRCodeData {
    return {
      signature_id: '', // Kosong karena bukan digital signature
      document_number: params.documentNumber,
      signed_at: params.tanggal,
      signer_name: params.signerName,
      signer_jabatan: params.signerJabatan,
      document_type: params.documentType,
      verification_url: undefined, // Tidak ada verifikasi untuk non-digsig
      pdf_url: params.pdfUrl,
    };
  }

  /**
   * Calculate optimal QR position berdasarkan page size
   * Untuk TTD section yang centered di area kanan
   */
  calculateTTDPosition(
    pageWidth: number,
    pageHeight: number,
    qrSize: number = 70,
  ): { x: number; y: number } {
    // TTD section biasanya:
    // - Horizontal: 2/3 dari kiri (center di area kanan)
    // - Vertical: sekitar 150-180 points dari bawah
    return {
      x: (pageWidth * 2 / 3) - (qrSize / 2),
      y: 150, // Default 150 points dari bawah
    };
  }
}
