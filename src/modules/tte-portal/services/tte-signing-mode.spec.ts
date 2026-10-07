import axios from 'axios';
import { Repository } from 'typeorm';
import { Session } from '../../auth/entities/session.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TteSignerIdentityService } from './tte-signer-identity.service';
import { TteSigningService } from './tte-signing.service';

type Dependencies = ConstructorParameters<typeof TteSigningService>;

describe('Portal identity mode in single and batch requests', () => {
  const previousMode = process.env.TTE_DIGSIG_MODE;
  const previousRedirect = process.env.TTE_REDIRECT_URL;
  afterEach(() => {
    jest.restoreAllMocks();
    if (previousMode === undefined) delete process.env.TTE_DIGSIG_MODE;
    else process.env.TTE_DIGSIG_MODE = previousMode;
    if (previousRedirect === undefined) delete process.env.TTE_REDIRECT_URL;
    else process.env.TTE_REDIRECT_URL = previousRedirect;
  });

  it.each([
    ['DEV', false],
    ['DEV', true],
    ['PRD', false],
    ['PRD', true],
  ] as const)(
    'uses the correct signer and mode for %s (batch=%s)',
    async (mode, batch) => {
      process.env.TTE_DIGSIG_MODE = mode;
      process.env.TTE_REDIRECT_URL = 'https://example.test/tte/callback';
      const session = {
        findOne: jest.fn().mockResolvedValue({
          id: 'browser-session',
          airnavAccessToken: 'token',
          airnavExpiredAt: new Date(Date.now() + 60000),
        }),
      };
      const hr = jest.spyOn(axios, 'get').mockResolvedValue({
        data: { data: [{ subType: '01', number: '1234567890123456' }] },
      });
      const request = {
        request_id: 'request',
        signing_url: 'https://example.test/sign',
        status: 'PENDING',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };
      const portal = {
        presignUpload: jest
          .fn()
          .mockResolvedValue({ upload_id: 'upload', status: 'PENDING' }),
        uploadPdfToStorage: jest.fn().mockResolvedValue(undefined),
        completeUpload: jest.fn().mockResolvedValue({ status: 'VERIFIED' }),
        createSigningRequest: jest.fn().mockResolvedValue(request),
        createSigningBatch: jest.fn().mockResolvedValue(request),
      };
      const transactions = {
        create: jest.fn((value: unknown) => value),
        save: jest.fn((value: unknown) => Promise.resolve(value)),
        update: jest.fn().mockResolvedValue(undefined),
      };
      const service = new TteSigningService(
        portal as unknown as Dependencies[0],
        {
          getFile: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7 test')),
        } as unknown as Dependencies[1],
        {} as Dependencies[2],
        new TteSignerIdentityService(session as unknown as Repository<Session>),
        transactions as unknown as Dependencies[4],
        {} as Dependencies[5],
      );
      jest
        .spyOn(
          service as unknown as { logActivity: () => Promise<void> },
          'logActivity',
        )
        .mockResolvedValue(undefined);
      const user = {
        persnum: 12345,
        nama: 'Signer',
        sessionId: 'browser-session',
      } as JwtPayload;
      const document = {
        sourceKey: 'document.pdf',
        filename: 'document.pdf',
        pathDokumen: 'naskah',
        location: 'Tangerang',
        reason: 'Signing',
      };
      if (batch)
        await service.createSigningBatch({
          user,
          documents: [document, document],
        });
      else await service.createSigningTransaction({ user, ...document });
      const nik = mode === 'DEV' ? '1234567890123452' : '1234567890123456';
      const requestMethod = batch
        ? portal.createSigningBatch
        : portal.createSigningRequest;
      expect(requestMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          signer_nik: nik,
          signer_name: 'Signer',
          digsig_mode: mode,
        }),
        expect.any(String),
      );
      expect(transactions.save).toHaveBeenCalledWith(
        expect.objectContaining({
          signerNik: nik,
          digsigMode: mode,
          userPersnum: 12345,
        }),
      );
      if (mode === 'DEV') expect(hr).not.toHaveBeenCalled();
      else
        expect(session.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'browser-session', userPersnum: 12345 },
          }),
        );
    },
  );
});
