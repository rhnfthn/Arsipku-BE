import { TteSigningService } from './tte-signing.service';
import { portalCorrespondenceSignatureOptions } from '../helpers/portal-correspondence-signature';

type Dependencies = ConstructorParameters<typeof TteSigningService>;

describe('Portal correspondence with client QR and invisible signing', () => {
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
    ['ND', false],
    ['SDI', false],
    ['SDE', false],
    ['DI', false],
    ['KA', false],
    ['SDE', true],
  ] as const)(
    'signs %s with client QR using INVISIBLE (batch=%s)',
    async (jenis, batch) => {
      process.env.TTE_DIGSIG_MODE = 'DEV';
      process.env.TTE_REDIRECT_URL = 'https://arsipku.test/tte/callback';
      const source = Buffer.from('%PDF-1.7 source');
      const portal = {
        presignUpload: jest
          .fn()
          .mockResolvedValue({ upload_id: 'upload', status: 'PENDING' }),
        uploadPdfToStorage: jest.fn().mockResolvedValue(undefined),
        completeUpload: jest.fn().mockResolvedValue({ status: 'VERIFIED' }),
        createSigningBatch: jest.fn().mockResolvedValue({
          request_id: 'request',
          signing_url: 'https://portal.test/sign',
          status: 'PENDING',
          expires_at: new Date(Date.now() + 60000).toISOString(),
        }),
        createSigningRequest: jest.fn().mockResolvedValue({
          request_id: 'request',
          signing_url: 'https://portal.test/sign',
          status: 'PENDING',
          expires_at: new Date(Date.now() + 60000).toISOString(),
        }),
      };
      const repository = {
        create: jest.fn((value: unknown) => value),
        save: jest.fn((value: unknown) => Promise.resolve(value)),
        update: jest.fn().mockResolvedValue(undefined),
      };
      const service = new TteSigningService(
        portal as unknown as Dependencies[0],
        {
          getFile: jest.fn().mockResolvedValue(source),
        } as unknown as Dependencies[1],
        {} as Dependencies[2],
        {
          getNik: jest.fn().mockResolvedValue('1234567890123452'),
        } as unknown as Dependencies[3],
        repository as unknown as Dependencies[4],
        {} as Dependencies[5],
      );
      jest
        .spyOn(
          service as unknown as { logActivity: () => Promise<void> },
          'logActivity',
        )
        .mockResolvedValue(undefined);
      const document = {
        sourceKey: 'unsigned.pdf',
        filename: 'unsigned.pdf',
        pathDokumen: 'nota-dinas/digsig',
        idNaskah: 'document',
        jenisNaskah: jenis,
        nomorNaskah: '001/TNG/X/2026',
        location: 'Tangerang',
        reason: 'Signing ND',
        user: { persnum: 1, nama: 'Signer' } as Parameters<
          TteSigningService['createSigningTransaction']
        >[0]['user'],
        ...portalCorrespondenceSignatureOptions(jenis),
      };
      if (batch)
        await service.createSigningBatch({
          user: document.user,
          documents: [
            document,
            { ...document, ...portalCorrespondenceSignatureOptions('SDI') },
          ],
        });
      else await service.createSigningTransaction(document);
      const visual = { tampilan: 'INVISIBLE' };
      if (batch)
        expect(portal.createSigningBatch).toHaveBeenCalledWith(
          expect.objectContaining({
            documents: [
              expect.objectContaining(visual),
              expect.objectContaining(visual),
            ],
          }),
          expect.any(String),
        );
      else
        expect(portal.createSigningRequest).toHaveBeenCalledWith(
          expect.objectContaining(visual),
          expect.any(String),
        );
      expect(portal.uploadPdfToStorage).toHaveBeenCalledWith(
        expect.anything(),
        source,
      );
      const sentPayload = batch
        ? portal.createSigningBatch.mock.calls[0][0]
        : portal.createSigningRequest.mock.calls[0][0];
      for (const item of batch ? sentPayload.documents : [sentPayload]) {
        expect(item).not.toHaveProperty('tag');
        expect(item).not.toHaveProperty('ttd64');
        expect(item).not.toHaveProperty('jenis_ttd_visual');
      }
    },
  );
});
