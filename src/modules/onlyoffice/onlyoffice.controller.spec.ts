import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { OnlyOfficeController } from './onlyoffice.controller';
import { OnlyOfficeService } from './services/onlyoffice.service';
import { StorageService } from '../storage/services/storage.service';
import { HttpService } from '@nestjs/axios';
import { NaskahUmumTempEntity } from './entities/naskah-umum-temp.entity';
import { of, throwError } from 'rxjs';
import * as jwt from 'jsonwebtoken';

describe('OnlyOfficeController', () => {
  let controller: OnlyOfficeController;
  let storage: { getFileUrl: jest.Mock; getFile: jest.Mock; uploadBuffer: jest.Mock };
  let http: { post: jest.Mock; get: jest.Mock };
  let tempRepo: { update: jest.Mock };
  const ooSecret = 's';

  const signCallbackToken = (payload: object): string =>
    jwt.sign(payload, ooSecret, { algorithm: 'HS256' });

  beforeEach(async () => {
    storage = {
      getFileUrl: jest.fn().mockResolvedValue('http://s3/doc.docx'),
      getFile: jest.fn().mockResolvedValue(Buffer.from('docx')),
      uploadBuffer: jest.fn().mockResolvedValue({ key: 'naskah-umum-temp/1234567890-t1-saved.docx', url: 'http://s3/saved.docx', bucket: 'arsipku' }),
    };
    http = { post: jest.fn(), get: jest.fn() };
    tempRepo = { update: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      controllers: [OnlyOfficeController],
      providers: [
        {
          provide: OnlyOfficeService,
          useValue: {
            buildEditorConfig: jest.fn().mockReturnValue({ token: 't', document: {}, editorConfig: {} }),
            signJwt: jest.fn().mockReturnValue('jwt'),
            getOnlyOfficeUrl: jest.fn().mockReturnValue('http://oo:80'),
          },
        },
        { provide: StorageService, useValue: storage },
        { provide: HttpService, useValue: http },
        { provide: getRepositoryToken(NaskahUmumTempEntity), useValue: tempRepo },
        { provide: ConfigService, useValue: { get: (k: string) => ({ APP_PUBLIC_URL: 'http://be:3000', ONLYOFFICE_URL: 'http://oo:80', ONLYOFFICE_JWT_SECRET: 's' }[k]) } },
      ],
    }).compile();
    controller = moduleRef.get(OnlyOfficeController);
  });

  const buildReq = (authHeader?: string): any => ({
    headers: authHeader ? { authorization: authHeader } : {},
  });

  it('callback status=2 downloads url and uploads saved docx, returns {error:0}', async () => {
    http.get.mockReturnValue(of({ data: Buffer.from('edited-docx') }));
    const token = signCallbackToken({ status: 2, key: 'k1', url: 'http://oo/download/docx' });
    const res = await controller.handleCallback(
      't1',
      buildReq(),
      { status: 2, key: 'k1', url: 'http://oo/download/docx', token },
    );
    expect(http.get).toHaveBeenCalledWith('http://oo/download/docx', { responseType: 'arraybuffer' });
    expect(storage.uploadBuffer).toHaveBeenCalledWith(
      Buffer.from('edited-docx'),
      't1-saved.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'naskah-umum-temp',
    );
    expect(tempRepo.update).toHaveBeenCalledWith('t1', {
      s3KeySaved: 'naskah-umum-temp/1234567890-t1-saved.docx',
      status: 'saved',
    });
    expect(res).toEqual({ error: 0 });
  });

  it('callback accepts token from Authorization header', async () => {
    http.get.mockReturnValue(of({ data: Buffer.from('edited-docx') }));
    const token = signCallbackToken({ status: 2, key: 'k1' });
    const res = await controller.handleCallback(
      't1',
      buildReq(`Bearer ${token}`),
      { status: 2, key: 'k1', url: 'http://oo/download/docx' },
    );
    expect(http.get).toHaveBeenCalled();
    expect(res).toEqual({ error: 0 });
  });

  it('callback rejects missing/invalid token', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await controller.handleCallback(
      't1',
      buildReq(),
      { status: 2, key: 'k1', url: 'http://oo/download/docx' },
    );
    expect(http.get).not.toHaveBeenCalled();
    expect(storage.uploadBuffer).not.toHaveBeenCalled();
    expect(tempRepo.update).not.toHaveBeenCalled();
    expect(res).toEqual({ error: 1 });
    errorSpy.mockRestore();
  });

  it('callback rejects non-OnlyOffice URL (SSRF)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const token = signCallbackToken({ status: 2, key: 'k1' });
    const res = await controller.handleCallback(
      't1',
      buildReq(),
      { status: 2, key: 'k1', url: 'http://attacker.internal/secret.docx', token },
    );
    expect(http.get).not.toHaveBeenCalled();
    expect(storage.uploadBuffer).not.toHaveBeenCalled();
    expect(tempRepo.update).not.toHaveBeenCalled();
    expect(res).toEqual({ error: 1 });
    errorSpy.mockRestore();
  });

  it('callback download failure returns {error:1} and does not upload', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    http.get.mockReturnValue(throwError(() => new Error('download failed')));
    const token = signCallbackToken({ status: 2, key: 'k1' });
    const res = await controller.handleCallback(
      't1',
      buildReq(),
      { status: 2, key: 'k1', url: 'http://oo/download/docx', token },
    );
    expect(storage.uploadBuffer).not.toHaveBeenCalled();
    expect(tempRepo.update).not.toHaveBeenCalled();
    expect(res).toEqual({ error: 1 });
    errorSpy.mockRestore();
  });

  it('callback status!=2 returns {error:0} without download', async () => {
    const token = signCallbackToken({ status: 1, key: 'k1' });
    const res = await controller.handleCallback(
      't1',
      buildReq(),
      { status: 1, key: 'k1', url: null, token },
    );
    expect(http.get).not.toHaveBeenCalled();
    expect(storage.uploadBuffer).not.toHaveBeenCalled();
    expect(tempRepo.update).not.toHaveBeenCalled();
    expect(res).toEqual({ error: 0 });
  });
});
