import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { OnlyOfficeService } from './onlyoffice.service';
import { StorageService } from '../../storage/services/storage.service';
import * as jwt from 'jsonwebtoken';

describe('OnlyOfficeService', () => {
  let service: OnlyOfficeService;
  let moduleRef: any;
  const secret = 'test-secret-1234567890';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        OnlyOfficeService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              ({
                ONLYOFFICE_URL: 'http://oo:80',
                ONLYOFFICE_JWT_SECRET: secret,
                APP_PUBLIC_URL: 'http://be:3000',
              })[k],
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            getFileUrl: jest.fn(),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(OnlyOfficeService);
  });

  it('throws on startup when ONLYOFFICE_URL is missing', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          OnlyOfficeService,
          {
            provide: ConfigService,
            useValue: {
              get: (k: string) =>
                k === 'ONLYOFFICE_JWT_SECRET' ? secret : undefined,
            },
          },
          { provide: HttpService, useValue: {} },
          { provide: StorageService, useValue: {} },
        ],
      }).compile(),
    ).rejects.toThrow('Missing required environment variable: ONLYOFFICE_URL');
  });

  it('throws on startup when ONLYOFFICE_JWT_SECRET is missing', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          OnlyOfficeService,
          {
            provide: ConfigService,
            useValue: {
              get: (k: string) =>
                k === 'ONLYOFFICE_URL' ? 'http://oo:80' : undefined,
            },
          },
          { provide: HttpService, useValue: {} },
          { provide: StorageService, useValue: {} },
        ],
      }).compile(),
    ).rejects.toThrow(
      'Missing required environment variable: ONLYOFFICE_JWT_SECRET',
    );
  });

  it('getOnlyOfficeUrl returns configured url', () => {
    expect(service.getOnlyOfficeUrl()).toBe('http://oo:80');
  });

  it('signJwt signs payload with HS256 + secret (verifiable)', () => {
    const payload = { a: 1 };
    const token = service.signJwt(payload);
    const decoded = jwt.verify(token, secret) as any;
    expect(decoded.a).toBe(1);
  });

  it('buildEditorConfig returns config with document, editorConfig, and token (JWT-signed)', () => {
    const cfg = service.buildEditorConfig({
      documentKey: 'k1',
      documentUrl: 'http://be:3000/doc.docx',
      documentTitle: 'UND.docx',
      fileType: 'docx',
      callbackUrl: 'http://be:3000/onlyoffice/callback/t1',
      userId: 'u1',
      userName: 'Budi',
      mode: 'edit',
    });
    expect(cfg.documentType).toBe('word');
    expect(cfg.document.key).toBe('k1');
    expect(cfg.document.url).toBe('http://be:3000/doc.docx');
    expect(cfg.editorConfig.callbackUrl).toBe(
      'http://be:3000/onlyoffice/callback/t1',
    );
    expect(cfg.editorConfig.mode).toBe('edit');
    expect(typeof cfg.token).toBe('string');
    const decoded = jwt.verify(cfg.token, secret) as any;
    expect(decoded.document.key).toBe('k1');
    expect(decoded.editorConfig.callbackUrl).toBe(
      'http://be:3000/onlyoffice/callback/t1',
    );
  });

  describe('convertToPdf', () => {
    it('POSTs to OnlyOffice converter with signed payload and returns PDF buffer', async () => {
      const http = moduleRef.get(HttpService);
      http.post = jest
        .fn()
        .mockReturnValueOnce(
          of({ data: { endConvert: true, url: 'http://oo/pdf' } }),
        );
      http.get = jest
        .fn()
        .mockReturnValueOnce(of({ data: Buffer.from('PDF') }));

      const pdf = await service.convertToPdf('naskah-umum-final/t1.docx');

      expect(http.post).toHaveBeenCalledWith(
        'http://oo:80/converter',
        expect.objectContaining({
          async: false,
          filetype: 'docx',
          outputtype: 'pdf',
          url: expect.stringMatching(
            /^http:\/\/be:3000\/onlyoffice\/storage-document\?token=/,
          ),
          token: expect.any(String),
        }),
        expect.any(Object),
      );
      expect(http.get).toHaveBeenCalledWith('http://oo/pdf', {
        responseType: 'arraybuffer',
      });
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.toString()).toBe('PDF');
    });

    it('throws when converter does not finish synchronously', async () => {
      const http = moduleRef.get(HttpService);

      http.post = jest
        .fn()
        .mockReturnValueOnce(of({ data: { endConvert: false, percent: 42 } }));

      await expect(service.convertToPdf('k.docx')).rejects.toThrow(
        'OnlyOffice convert did not finish synchronously',
      );
    });
  });
});
