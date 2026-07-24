import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { OnlyOfficeService } from './services/onlyoffice.service';
import { StorageService } from '../storage/services/storage.service';
import { EditorConfig } from './dto/editor-config.dto';
import { NaskahUmumTempEntity } from './entities/naskah-umum-temp.entity';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@Controller('onlyoffice')
export class OnlyOfficeController {
  constructor(
    private readonly oo: OnlyOfficeService,
    private readonly storage: StorageService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectRepository(NaskahUmumTempEntity)
    private readonly tempRepo: Repository<NaskahUmumTempEntity>,
  ) {}

  /** FE calls this to get signed editor config for a temp doc. */
  @Get('editor-config/:tempId')
  async getEditorConfig(
    @Param('tempId') tempId: string,
    @Req() req: any,
  ): Promise<{ config: EditorConfig }> {
    // tempDoc lookup via NaskahUmumTempRepository — inject later; MVP: pass query params
    const title = (req.query.title as string) || 'naskah.docx';
    const appPublicUrl = this.config.get<string>('APP_PUBLIC_URL');
    const fileUrl = `${appPublicUrl}/onlyoffice/document/${tempId}`;
    const callbackUrl = `${appPublicUrl}/onlyoffice/callback/${tempId}`;
    const user = req.user ?? { id: 'u1', name: 'User' };
    const config = this.oo.buildEditorConfig({
      documentKey: `${tempId}-${Date.now()}`,
      documentUrl: fileUrl,
      documentTitle: title,
      fileType: 'docx',
      callbackUrl,
      userId: String(user.persnum ?? user.id ?? 'u1'),
      userName: user.nama ?? user.name ?? 'User',
      mode: 'edit',
    });
    return { config };
  }

  /**
   * OnlyOffice downloads the source DOCX from inside its Docker container.
   * Stream through the backend so local MinIO does not need to be reachable
   * directly from that container.
   */
  @Public()
  @SkipTransform()
  @Get('document/:tempId')
  async streamDocument(
    @Param('tempId') tempId: string,
    @Res() res: Response,
  ): Promise<void> {
    const temp = await this.tempRepo.findOne({ where: { id: tempId } });
    if (!temp) {
      res.status(HttpStatus.NOT_FOUND).json({ error: 1 });
      return;
    }

    const buffer = await this.storage.getFile(temp.s3KeySaved || temp.s3Key);
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `inline; filename="${tempId}.docx"`,
        'Cache-Control': 'no-store',
      })
      .send(buffer);
  }

  @Public()
  @SkipTransform()
  @Get('storage-document')
  async streamStorageDocument(
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!token) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 1 });
      return;
    }

    let payload: jwt.JwtPayload & { purpose?: string; s3Key?: string };
    try {
      payload = jwt.verify(token, this.ooServiceJwtSecret(), {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload & { purpose?: string; s3Key?: string };
    } catch {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 1 });
      return;
    }

    if (payload.purpose !== 'onlyoffice-storage-document' || !payload.s3Key) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 1 });
      return;
    }

    const buffer = await this.storage.getFile(payload.s3Key);
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'inline; filename="document.docx"',
        'Cache-Control': 'no-store',
      })
      .send(buffer);
  }

  /**
   * OnlyOffice POSTs here on save (status 2 = saved, url = download link).
   * Marked @Public() because OnlyOffice server-to-server requests cannot send
   * our app JWT. We validate the callback via the token OnlyOffice signs with
   * ONLYOFFICE_JWT_SECRET and restrict downloads to the configured OnlyOffice host.
   */
  @Public()
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post('callback/:tempId')
  async handleCallback(
    @Param('tempId') tempId: string,
    @Req() req: any,
    @Body()
    body: { status: number; key: string; url: string | null; token?: string },
  ): Promise<{ error: number }> {
    if (!this.verifyCallbackToken(req, body)) {
      console.error('[OnlyOffice callback] Invalid or missing callback token');
      return { error: 1 };
    }

    if (body.status === 2 && body.url) {
      if (!this.isOnlyOfficeUrl(body.url)) {
        console.error(
          '[OnlyOffice callback] Rejected callback URL (SSRF):',
          body.url,
        );
        return { error: 1 };
      }
      try {
        const { data } = await firstValueFrom(
          this.http.get(body.url, { responseType: 'arraybuffer' }),
        );
        const buf = Buffer.from(data);
        const uploadResult = await this.storage.uploadBuffer(
          buf,
          `${tempId}-saved.docx`,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'naskah-umum-temp',
        );
        await this.tempRepo.update(tempId, {
          s3KeySaved: uploadResult.key,
          status: 'saved',
        });
      } catch (err) {
        console.error('[OnlyOffice callback] download/upload failed:', err);
        return { error: 1 };
      }
    }
    return { error: 0 };
  }

  private verifyCallbackToken(
    req: any,
    body: { status: number; key: string; url: string | null; token?: string },
  ): boolean {
    const token =
      body.token ||
      (req.headers?.authorization as string | undefined)?.replace(
        /^Bearer\s+/i,
        '',
      );
    if (!token) return false;
    try {
      jwt.verify(token, this.ooServiceJwtSecret(), { algorithms: ['HS256'] });
      return true;
    } catch (e) {
      return false;
    }
  }

  private ooServiceJwtSecret(): string {
    return this.config.get<string>('ONLYOFFICE_JWT_SECRET')!;
  }

  private isOnlyOfficeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const configured = new URL(this.config.get<string>('ONLYOFFICE_URL')!);
      return parsed.hostname === configured.hostname;
    } catch {
      return false;
    }
  }
}
