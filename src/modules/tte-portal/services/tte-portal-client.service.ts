import {
  BadRequestException,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';

/**
 * HTTP client untuk Portal TTE (client integration).
 *
 * Semua panggilan server-to-server ke portal memakai credential dari env:
 * - Opsi A: Authorization: Bearer <TTE_API_KEY>
 * - Opsi B: X-Client-Id + X-Client-Secret
 *
 * Kontrak: docs/TTE-Digsig/dokumentasi-integrasi-client-portal-tte.md
 * Jangan pernah log: API key, presigned URL lengkap, NIK lengkap,
 * authorization code, signing token.
 */

// ── Response types portal ────────────────────────────────────────────────

export interface TtePresignResponse {
  upload_id: string;
  object_key: string;
  original_name: string;
  content_type: string;
  size: number;
  sha256: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  expires_at: string;
  completed_at: string | null;
  verified_at: string | null;
  upload_url: string;
  required_headers: Record<string, string>;
  idempotent_replay: boolean;
}

export interface TteUploadCompleteResponse {
  upload_id: string;
  object_key: string;
  original_name: string;
  content_type: string;
  size: number;
  sha256: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  expires_at: string;
  completed_at: string | null;
  verified_at: string | null;
  idempotent_replay: boolean;
}

export interface TteSigningRequestResponse {
  request_id: string;
  upload_id: string;
  status: string;
  tampilan: 'INVISIBLE' | 'VISIBLE';
  redirect_url: string;
  state: string;
  expires_at: string;
  opened_at: string | null;
  processing_at: string | null;
  signed_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  digsig_mode: 'DEV' | 'PRD';
  progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
  signing_url: string;
  idempotent_replay: boolean;
}

export interface TteBatchResponse {
  request_id: string;
  status: string;
  total_items: number;
  digsig_mode: 'DEV' | 'PRD';
  expires_at: string;
  signing_url: string;
  idempotent_replay: boolean;
}

export interface TteSignedDocument {
  item_id: string;
  upload_id: string;
  name: string;
  status: string;
  sha256: string;
  download_url: string;
  download_expires_at: string;
  error_code?: string | null;
  error_message?: string | null;
}

export interface TteExchangeResponse {
  request_id: string;
  upload_id: string;
  status: string;
  signed_at: string | null;
  documents: TteSignedDocument[];
  download_url: string | null;
  download_expires_at: string | null;
}

export interface TteStatusResponse {
  request_id: string;
  upload_id: string | null;
  status: string;
  tampilan: 'INVISIBLE' | 'VISIBLE' | null;
  redirect_url: string;
  state: string;
  expires_at: string | null;
  opened_at: string | null;
  processing_at: string | null;
  signed_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  digsig_mode: 'DEV' | 'PRD' | null;
  progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
  documents?: Record<string, any>;
  items?: Array<{
    item_id: string;
    upload_id: string;
    position: number;
    name: string;
    status: string;
    tampilan: 'INVISIBLE' | 'VISIBLE';
    error_code: string | null;
    error_message: string | null;
    signed_object_key: string | null;
  }>;
}

export interface TteDownloadUrlResponse {
  download_url: string;
  expires_at: string;
}

// ── Request types ────────────────────────────────────────────────────────

export interface TteCreateSigningRequest {
  upload_id: string;
  redirect_url: string;
  state: string;
  tampilan: 'INVISIBLE' | 'VISIBLE';
  location: string;
  reason: string;
  signer_nik: string;
  signer_name?: string;
  tag?: string;
  jenis_ttd_visual?: 'image' | 'qrcode' | 'qrcode_image';
  signature_width?: number;
  signature_height?: number;
  digsig_mode: 'DEV' | 'PRD';
}

export interface TteBatchDocument {
  upload_id: string;
  tampilan: 'INVISIBLE' | 'VISIBLE';
  tag?: string;
  location?: string;
  reason?: string;
  jenis_ttd_visual?: 'image' | 'qrcode' | 'qrcode_image';
  signature_width?: number;
  signature_height?: number;
}

export interface TteCreateBatchRequest {
  documents: TteBatchDocument[];
  redirect_url: string;
  state: string;
  location: string;
  reason: string;
  signer_nik: string;
  signer_name?: string;
  digsig_mode: 'DEV' | 'PRD';
}

@Injectable()
export class TtePortalClientService {
  private readonly logger = new Logger(TtePortalClientService.name);

  private get baseUrl(): string {
    const url = process.env.TTE_BASE_URL;
    if (!url) throw new Error('TTE_BASE_URL belum dikonfigurasi di .env');
    return url.replace(/\/+$/, '');
  }

  /**
   * Header autentikasi client — Opsi A (Bearer API Key) atau Opsi B
   * (X-Client-Id + X-Client-Secret). Prioritas API Key bila keduanya diisi.
   */
  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (process.env.TTE_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.TTE_API_KEY}`;
    } else if (process.env.TTE_CLIENT_ID && process.env.TTE_CLIENT_SECRET) {
      headers['X-Client-Id'] = process.env.TTE_CLIENT_ID;
      headers['X-Client-Secret'] = process.env.TTE_CLIENT_SECRET;
    } else {
      throw new Error(
        'Credential Portal TTE belum dikonfigurasi (TTE_API_KEY atau TTE_CLIENT_ID+TTE_CLIENT_SECRET)',
      );
    }
    return headers;
  }

  /** Idempotency-Key 8–128 printable ASCII tanpa spasi */
  static generateIdempotencyKey(): string {
    return `arsipku-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  /** State anti-CSRF acak (base64url, aman untuk query string) */
  static generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /** SHA-256 hex lowercase dari buffer */
  static sha256Hex(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static assertPdf(buffer: Buffer, label: string): void {
    const maxBytes = Number(
      process.env.TTE_MAX_FILE_SIZE_BYTES || 20 * 1024 * 1024,
    );
    if (!buffer.length || buffer.length > maxBytes) {
      throw new BadRequestException(
        `${label} tidak valid: ukuran harus 1-${maxBytes} byte`,
      );
    }
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException(`${label} bukan dokumen PDF yang valid`);
    }
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: {
      body?: unknown;
      idempotencyKey?: string;
      timeoutMs?: number;
      retryable?: boolean;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.authHeaders,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const retryable =
      options.retryable ??
      (method === 'GET' || Boolean(options.idempotencyKey));
    const maxAttempts = retryable ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await axios.request<T>({
          method,
          url: `${this.baseUrl}${path}`,
          headers,
          data: options.body,
          timeout: options.timeoutMs ?? 30_000,
          // Jangan biarkan axios throw pada status non-2xx — kita handle manual
          validateStatus: () => true,
        });

        if (
          attempt < maxAttempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          const retryAfter = Number(response.headers['retry-after']);
          const delayMs = Number.isFinite(retryAfter)
            ? Math.min(retryAfter * 1000, 3000)
            : 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
          await this.delay(delayMs);
          continue;
        }

        if (response.status >= 400) {
          const errBody = response.data as
            | { message?: string; error?: string; code?: string }
            | undefined;
          throw new HttpException(
            {
              success: false,
              message:
                errBody?.error ||
                errBody?.message ||
                `Portal TTE error HTTP ${response.status}`,
              source: 'tte-portal',
              code: errBody?.code,
              detail: errBody,
            },
            response.status,
          );
        }

        return response.data;
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (axios.isAxiosError(error)) {
          if (attempt < maxAttempts) {
            await this.delay(
              250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100),
            );
            continue;
          }
          const axiosErr = error as AxiosError;
          this.logger.error(
            `Portal TTE unreachable: ${axiosErr.message} (${path})`,
          );
          throw new HttpException(
            {
              success: false,
              message: 'Gagal terhubung ke Portal TTE',
              source: 'tte-portal',
            },
            HttpStatus.BAD_GATEWAY,
          );
        }
        throw error;
      }
    }
    throw new HttpException(
      'Portal TTE tidak merespons',
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Endpoint 1: POST /uploads/presign ─────────────────────────────────

  async presignUpload(params: {
    filename: string;
    size: number;
    sha256?: string;
    idempotencyKey: string;
  }): Promise<TtePresignResponse> {
    return this.request<TtePresignResponse>('POST', '/uploads/presign', {
      body: {
        filename: params.filename,
        content_type: 'application/pdf',
        size: params.size,
        ...(params.sha256 ? { sha256: params.sha256 } : {}),
      },
      idempotencyKey: params.idempotencyKey,
    });
  }

  // ── Endpoint 2: PUT <upload_url> (object storage, bukan API portal) ────

  /**
   * Upload raw PDF bytes ke object storage portal via presigned URL.
   * Salin required_headers PERSIS dari presign — jangan kirim auth client.
   */
  async uploadPdfToStorage(
    presign: TtePresignResponse,
    pdfBuffer: Buffer,
  ): Promise<void> {
    const response = await axios.put(presign.upload_url, pdfBuffer, {
      headers: presign.required_headers,
      timeout: 60_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });
    if (response.status >= 400) {
      this.logger.error(
        `Upload ke object storage portal gagal: HTTP ${response.status}`,
      );
      throw new HttpException(
        {
          success: false,
          message: `Upload PDF ke storage Portal TTE gagal (HTTP ${response.status})`,
          source: 'tte-portal-storage',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ── Endpoint 3: POST /uploads/{upload_id}/complete ─────────────────────

  async completeUpload(uploadId: string): Promise<TteUploadCompleteResponse> {
    return this.request<TteUploadCompleteResponse>(
      'POST',
      `/uploads/${uploadId}/complete`,
      { retryable: true },
    );
  }

  // ── Endpoint 4: POST /signing-requests ─────────────────────────────────

  async createSigningRequest(
    payload: TteCreateSigningRequest,
    idempotencyKey: string,
  ): Promise<TteSigningRequestResponse> {
    return this.request<TteSigningRequestResponse>(
      'POST',
      '/signing-requests',
      { body: payload, idempotencyKey },
    );
  }

  // ── Endpoint 5: POST /signing-batches ───────────────────────────────────

  async createSigningBatch(
    payload: TteCreateBatchRequest,
    idempotencyKey: string,
  ): Promise<TteBatchResponse> {
    return this.request<TteBatchResponse>('POST', '/signing-batches', {
      body: payload,
      idempotencyKey,
    });
  }

  // ── Endpoint 6: GET /signing-requests/{request_id} ──────────────────────

  async getSigningStatus(requestId: string): Promise<TteStatusResponse> {
    return this.request<TteStatusResponse>(
      'GET',
      `/signing-requests/${requestId}`,
    );
  }

  // ── Endpoint 7: POST /signing/authorization-code/exchange ─────────────

  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
    state: string;
  }): Promise<TteExchangeResponse> {
    return this.request<TteExchangeResponse>(
      'POST',
      '/signing/authorization-code/exchange',
      {
        body: {
          code: params.code,
          redirect_uri: params.redirectUri,
          state: params.state,
        },
      },
    );
  }

  // ── Endpoint 8: GET /signing-requests/{request_id}/download ────────────

  async getDownloadUrl(
    requestId: string,
    itemId?: string,
  ): Promise<TteDownloadUrlResponse> {
    const query = itemId ? `?item_id=${encodeURIComponent(itemId)}` : '';
    return this.request<TteDownloadUrlResponse>(
      'GET',
      `/signing-requests/${requestId}/download${query}`,
    );
  }

  // ── Download binary dari presigned URL (object storage) ────────────────

  async downloadSignedPdf(downloadUrl: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });
    if (response.status >= 400) {
      throw new HttpException(
        {
          success: false,
          message: `Download PDF signed dari Portal TTE gagal (HTTP ${response.status})`,
          source: 'tte-portal-storage',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    const buffer = Buffer.from(response.data);
    TtePortalClientService.assertPdf(buffer, 'Hasil Portal TTE');
    return buffer;
  }
}
