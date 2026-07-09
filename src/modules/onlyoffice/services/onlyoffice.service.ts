import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import * as jwt from 'jsonwebtoken';
import { firstValueFrom } from 'rxjs';
import { EditorConfig } from '../dto/editor-config.dto';
import { StorageService } from '../../storage/services/storage.service';

@Injectable()
export class OnlyOfficeService {
  private readonly enabled: boolean;
  private readonly ooUrl: string;
  private readonly jwtSecret: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly storage: StorageService,
  ) {
    // Kill switch: ONLYOFFICE_ENABLED=false (default) → feature off, gak throw.
    // ONLYOFFICE_ENABLED=true → feature on, methods lazy-throw kalau URL/SECRET missing.
    this.enabled = this.config.get<string>('ONLYOFFICE_ENABLED') === 'true';
    this.ooUrl = this.config.get<string>('ONLYOFFICE_URL') || '';
    this.jwtSecret = this.config.get<string>('ONLYOFFICE_JWT_SECRET') || '';
    this.publicBaseUrl = this.config.get<string>('APP_PUBLIC_URL') || '';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new BadRequestException(
        'OnlyOffice feature is disabled. Set ONLYOFFICE_ENABLED=true and configure ONLYOFFICE_URL + ONLYOFFICE_JWT_SECRET to enable.',
      );
    }
    if (!this.ooUrl) {
      throw new BadRequestException('Missing required environment variable: ONLYOFFICE_URL');
    }
    if (!this.jwtSecret) {
      throw new BadRequestException('Missing required environment variable: ONLYOFFICE_JWT_SECRET');
    }
  }

  getOnlyOfficeUrl(): string {
    return this.ooUrl;
  }

  signJwt(payload: object): string {
    this.ensureEnabled();
    return jwt.sign(payload as object, this.jwtSecret, { algorithm: 'HS256' });
  }

  buildStorageDocumentUrl(s3Key: string): string {
    this.ensureEnabled();
    if (!this.publicBaseUrl) {
      throw new BadRequestException('Missing required environment variable: APP_PUBLIC_URL');
    }
    const token = this.signJwt({
      purpose: 'onlyoffice-storage-document',
      s3Key,
    });
    return `${this.publicBaseUrl}/onlyoffice/storage-document?token=${encodeURIComponent(token)}`;
  }

  buildEditorConfig(opts: {
    documentKey: string;
    documentUrl: string;
    documentTitle: string;
    fileType: string;
    callbackUrl: string;
    userId: string;
    userName: string;
    mode: 'edit' | 'view';
  }): EditorConfig {
    this.ensureEnabled();
    const isEdit = opts.mode === 'edit';
    const base = {
      documentType: 'word' as const,
      document: {
        fileType: opts.fileType,
        key: opts.documentKey,
        title: opts.documentTitle,
        url: opts.documentUrl,
        permissions: {
          edit: isEdit,
          download: true,
          review: isEdit,
          print: true,
        },
      },
      editorConfig: {
        mode: opts.mode,
        callbackUrl: opts.callbackUrl,
        user: { id: opts.userId, name: opts.userName },
        customization: { forcesave: true, compactHeader: true },
      },
    };
    return { ...base, token: this.signJwt(base) };
  }

  /**
   * Convert a DOCX stored in S3 to PDF via OnlyOffice Document Converter API.
   * OnlyOffice fetches the DOCX through the backend because local MinIO is not
   * always reachable from inside the document-server container.
   */
  async convertToPdf(s3Key: string): Promise<Buffer> {
    this.ensureEnabled();
    const fileUrl = this.buildStorageDocumentUrl(s3Key);
    const payload = {
      async: false,
      filetype: 'docx',
      outputtype: 'pdf',
      key: `${s3Key}-${Date.now()}`,
      url: fileUrl,
      documentLayout: {
        drawPlaceHolders: true,
        drawFormHighlight: true,
        isPrint: true,
      },
    };
    const token = this.signJwt(payload);

    const { data } = await firstValueFrom(
      this.http.post(`${this.ooUrl}/converter`, { ...payload, token }, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    if (data?.endConvert === true && data?.url) {
      const pdfRes = await firstValueFrom(
        this.http.get(data.url, { responseType: 'arraybuffer' }),
      );
      return Buffer.from(pdfRes.data);
    }

    throw new Error(
      `OnlyOffice convert did not finish synchronously: ${JSON.stringify(data)}`,
    );
  }
}