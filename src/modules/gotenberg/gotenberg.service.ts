import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import PizZip from 'pizzip';

/** Thin HTTP adapter for the self-hosted Gotenberg conversion service. */
@Injectable()
export class GotenbergService {
  private readonly logger = new Logger(GotenbergService.name);
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('GOTENBERG_URL') || '').replace(
      /\/+$/,
      '',
    );
    this.username =
      this.config.get<string>('GOTENBERG_API_BASIC_AUTH_USERNAME') || '';
    this.password =
      this.config.get<string>('GOTENBERG_API_BASIC_AUTH_PASSWORD') || '';
    this.timeoutMs = Math.max(
      5_000,
      Number(this.config.get<string>('GOTENBERG_TIMEOUT_MS') || 60_000),
    );
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async convertDocxToPdf(
    buffer: Buffer,
    filename = 'naskah.docx',
  ): Promise<Buffer> {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(
        'Gotenberg belum dikonfigurasi. Set GOTENBERG_URL pada environment backend.',
      );
    }

    const conversionBuffer = this.normalizeAirnavHeaderForLibreOffice(buffer);
    const form = new FormData();
    form.append('files', conversionBuffer, {
      filename,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    // Pertahankan layout DOCX semaksimal mungkin. Pembaruan index oleh
    // LibreOffice dapat menggeser pagination/header, sedangkan form field yang
    // tidak diratakan dapat dihitung menggunakan metrik font fallback.
    form.append('updateIndexes', 'false');
    form.append('exportFormFields', 'false');
    form.append('losslessImageCompression', 'true');
    form.append('reduceImageResolution', 'false');

    try {
      const response = await axios.post<Buffer>(
        `${this.baseUrl}/forms/libreoffice/convert`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Accept: 'application/pdf',
          },
          auth:
            this.username || this.password
              ? { username: this.username, password: this.password }
              : undefined,
          responseType: 'arraybuffer',
          timeout: this.timeoutMs,
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
        },
      );

      const pdf = Buffer.from(response.data);
      if (pdf.length < 5 || pdf.subarray(0, 5).toString() !== '%PDF-') {
        throw new Error('Gotenberg mengembalikan payload yang bukan PDF.');
      }
      return pdf;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const detail = axios.isAxiosError(error)
        ? `${error.response?.status ?? 'network'} ${this.errorBody(error)}`
        : error instanceof Error
          ? error.message
          : String(error);
      this.logger.error(
        `Gagal mengonversi DOCX ke PDF via Gotenberg: ${detail}`,
      );
      throw new ServiceUnavailableException(
        'Gagal membuat PDF pratinjau dari DOCX. Silakan coba lagi.',
      );
    }
  }

  /**
   * Kop AirNav pada template lama dibuat sebagai grouped floating text boxes.
   * Microsoft Word dapat menampilkannya, tetapi LibreOffice membungkus alamat
   * di kotak berukuran tetap lalu garis kop menimpa baris terakhir. Normalisasi
   * hanya diterapkan pada fingerprint kop tersebut dan hanya pada buffer yang
   * dikirim ke Gotenberg; DOCX asli di object storage tidak diubah.
   */
  private normalizeAirnavHeaderForLibreOffice(buffer: Buffer): Buffer {
    try {
      const zip = new PizZip(buffer);
      let changed = false;
      for (const name of Object.keys(zip.files).filter((path) =>
        /^word\/header\d+\.xml$/.test(path),
      )) {
        const file = zip.file(name);
        if (!file) continue;
        const original = file.asText();
        if (
          !original.includes('Perum LPPNPI') ||
          !original.includes('www.airnavindonesia.co.id')
        ) {
          continue;
        }

        const normalized = original
          // Lebarkan dan tinggikan kotak alamat pada DrawingML serta fallback VML.
          .replace(
            /<a:off x="3381776" y="0"\/>\s*<a:ext cx="2042018" cy="1259128"\/>/g,
            '<a:off x="2800000" y="0"/><a:ext cx="2623794" cy="1450000"/>',
          )
          .replace(
            /left:3381776;top:0;height:1259128;width:2042018;/g,
            'left:2800000;top:0;height:1450000;width:2623794;',
          )
          // Gunakan leading eksplisit agar delapan baris alamat tidak terpotong.
          .replace(
            /w:line="240" w:lineRule="auto"/g,
            'w:line="200" w:lineRule="exact"',
          )
          // Turunkan garis pemisah agar berada setelah alamat dan situs web.
          .replace(/1332942/g, '1600000')
          .replace(
            /<wp:posOffset>981075<\/wp:posOffset>/g,
            '<wp:posOffset>1248133</wp:posOffset>',
          )
          .replace(/margin-top:77\.25pt/g, 'margin-top:98.25pt');

        if (normalized !== original) {
          zip.file(name, normalized);
          changed = true;
        }
      }
      return changed
        ? zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
        : buffer;
    } catch (error) {
      this.logger.warn(
        `Normalisasi kop DOCX dilewati: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buffer;
    }
  }

  private errorBody(error: AxiosError): string {
    const data = error.response?.data;
    if (Buffer.isBuffer(data)) return data.toString('utf8').slice(0, 500);
    if (typeof data === 'string') return data.slice(0, 500);
    return error.message;
  }
}
