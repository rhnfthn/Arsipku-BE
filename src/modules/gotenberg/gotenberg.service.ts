import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';

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

    const form = new FormData();
    form.append('files', buffer, {
      filename,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

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

  private errorBody(error: AxiosError): string {
    const data = error.response?.data;
    if (Buffer.isBuffer(data)) return data.toString('utf8').slice(0, 500);
    if (typeof data === 'string') return data.slice(0, 500);
    return error.message;
  }
}
