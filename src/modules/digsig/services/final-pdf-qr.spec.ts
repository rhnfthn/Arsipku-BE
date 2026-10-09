import passport from 'passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { sign } from 'jsonwebtoken';
import { Reflector } from '@nestjs/core';
import { TransformResponseInterceptor } from '../../../common/interceptors/transform-response.interceptor';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { DigsigController } from '../controllers/digsig.controller';
import { StorageService } from '../../storage/services/storage.service';
import { NotFoundException } from '@nestjs/common';
import { DigsigService } from './digsig.service';
import {
  finalPdfQrReference,
  finalPdfQrUrl,
  finalPdfQrViewerUrl,
} from './final-pdf-qr.util';
import { QRCodeService } from './qrcode.service';
import * as QRCode from 'qrcode';

const id = '98bb6041-022f-4c6b-8517-0818993ad590';
const nomor = '001/TNG/X/2026';

function setup(status = 'final') {
  const document = {
    id,
    nomor,
    status,
    final_pdf: 'final.pdf',
    tandaTangan: null as string | null,
  };
  const repository = { findOne: jest.fn().mockResolvedValue(document) };
  const storage = {
    getFile: jest.fn().mockResolvedValue(Buffer.from('%PDF-final')),
  };
  const service = Object.create(DigsigService.prototype) as DigsigService;
  Object.defineProperty(service, 'naskahRepository', { value: repository });
  Object.defineProperty(service, 'storageService', { value: storage });
  return { service, document, storage };
}

describe('Final PDF QR destination', () => {
  it('opens the latest stored final PDF after Portal completion', async () => {
    const state = setup('final_tte');
    state.document.tandaTangan = JSON.stringify({
      mode: 'portal',
      signed_at: '2026-10-09T03:00:00Z',
    });
    const reference = finalPdfQrReference(id, nomor);
    state.document.final_pdf = 'signed-final.pdf';
    expect(await state.service.getFinalPdfForQr(id, reference)).toEqual(
      Buffer.from('%PDF-final'),
    );
    expect(state.storage.getFile).toHaveBeenCalledWith('signed-final.pdf');
  });

  it.each(['draf', 'pending', 'pending_tte', 'batal'])(
    'does not expose a %s PDF',
    async (status) => {
      const state = setup(status);
      await expect(
        state.service.getFinalPdfForQr(id, finalPdfQrReference(id, nomor)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(state.storage.getFile).not.toHaveBeenCalled();
    },
  );

  it('rejects a stale number, a missing PDF, or incomplete Portal signing', async () => {
    const state = setup('final_tte');
    await expect(
      state.service.getFinalPdfForQr(
        id,
        finalPdfQrReference(id, 'previous-number'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    state.document.final_pdf = '';
    await expect(
      state.service.getFinalPdfForQr(id, finalPdfQrReference(id, nomor)),
    ).rejects.toBeInstanceOf(NotFoundException);
    state.document.final_pdf = 'unsigned.pdf';
    state.document.tandaTangan = JSON.stringify({ mode: 'portal' });
    await expect(
      state.service.getFinalPdfForQr(id, finalPdfQrReference(id, nomor)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(state.storage.getFile).not.toHaveBeenCalled();
  });

  it('encodes a stable final PDF URL instead of legacy metadata or a temporary path', async () => {
    const service = new QRCodeService();
    const buffer = await service.generateQRCodeBuffer({
      document_id: id,
      document_number: nomor,
      signature_id: '',
      signed_at: '',
      signer_name: '',
      signer_jabatan: '',
      document_type: 'ND',
      pdf_url: 'https://storage.example/temporary.pdf',
    });
    expect(buffer).toEqual(
      await QRCode.toBuffer(finalPdfQrUrl(id, nomor), {
        errorCorrectionLevel: 'H',
        margin: 4,
        scale: 8,
        type: 'png',
      }),
    );
  });
});

// Exercise QR login redirection and the protected PDF API with the real JWT guard.
describe('Scanned QR PDF endpoint', () => {
  it('redirects scans to login and serves PDF bytes only with a valid JWT', async () => {
    const secret = 'qr-http-test-secret';
    passport.use(
      'jwt',
      new Strategy(
        {
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
          secretOrKey: secret,
        },
        (_payload: unknown, done) => done(null, { persnum: 1 }),
      ),
    );
    const token = sign({ persnum: 1 }, secret, { expiresIn: '1m' });
    const state = setup();
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [DigsigController],
      providers: [
        { provide: DigsigService, useValue: state.service },
        { provide: StorageService, useValue: state.storage },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalInterceptors(
      new TransformResponseInterceptor(app.get(Reflector)),
    );
    await app.init();
    try {
      await request(app.getHttpServer())
        .get(`/digsig/pdf/${id}?ref=${finalPdfQrReference(id, nomor)}`)
        .expect(302)
        .expect(
          'Location',
          finalPdfQrViewerUrl(id, finalPdfQrReference(id, nomor)),
        );
      expect(state.storage.getFile).not.toHaveBeenCalled();
      await request(app.getHttpServer())
        .get(`/digsig/pdf/${id}/content?ref=${finalPdfQrReference(id, nomor)}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/digsig/pdf/${id}/content?ref=${finalPdfQrReference(id, nomor)}`)
        .set(
          'Authorization',
          `Bearer ${sign({ persnum: 1 }, secret, { expiresIn: -1 })}`,
        )
        .expect(401);
      expect(state.storage.getFile).not.toHaveBeenCalled();
      await request(app.getHttpServer())
        .get(`/digsig/pdf/${id}/content?ref=${finalPdfQrReference(id, nomor)}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect('Content-Type', 'application/pdf')
        .expect('Content-Disposition', 'inline; filename="naskah-final.pdf"')
        .expect('Cache-Control', 'no-store')
        .expect((response) => {
          expect(response.body).toEqual(Buffer.from('%PDF-final'));
        });
      await request(app.getHttpServer())
        .get(`/digsig/pdf/${id}/content?ref=incorrect`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    } finally {
      await app.close();
      passport.unuse('jwt');
    }
  });
});
