import { PortalNaskahTteCompletionHandler } from './portal-naskah-tte-completion.handler';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';
import { portalCorrespondenceSignatureId } from '../helpers/portal-correspondence-signature';

type Dependencies = ConstructorParameters<
  typeof PortalNaskahTteCompletionHandler
>;

describe('Persisting Portal PDF with client QR', () => {
  it('preserves signed PDF bytes and binds metadata to the embedded QR reservation', async () => {
    const document = {
      id: 'document',
      tanggal: new Date(),
      status: 'pending_tte',
      nomor: '001/TNG/X/2026',
    };
    const naskah = {
      findOne: jest.fn().mockResolvedValue(document),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const sirkulasi = {
      update: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };
    const signedBuffer = Buffer.from(
      '%PDF-1.7 signed PDF with embedded client QR',
    );
    const storage = {
      getFile: jest.fn().mockResolvedValue(signedBuffer),
      uploadBuffer: jest.fn().mockResolvedValue({ key: 'final/signed.pdf' }),
    };
    const handler = new PortalNaskahTteCompletionHandler(
      naskah as unknown as Dependencies[0],
      sirkulasi as unknown as Dependencies[1],
      { count: jest.fn().mockResolvedValue(0) } as unknown as Dependencies[2],
      storage as unknown as Dependencies[3],
      {} as Dependencies[4],
      {
        syncNaskah: jest.fn().mockResolvedValue(undefined),
      } as unknown as Dependencies[5],
    );
    await handler.completeSigning(
      {
        id: 'transaction',
        idNaskah: document.id,
        jenisNaskah: 'SDI',
        nomorNaskah: document.nomor,
        requestId: 'request',
        signedAt: new Date('2026-10-07T10:00:00Z'),
        signerName: 'Signer',
      } as TteSigningTransactionEntity,
      'signed-result.pdf',
    );
    expect(storage.uploadBuffer).toHaveBeenCalledWith(
      signedBuffer,
      expect.any(String),
      'application/pdf',
      expect.any(String),
    );
    const update = naskah.update.mock.calls[0][1] as {
      tandaTangan: string;
      status: string;
    };
    const metadata = JSON.parse(update.tandaTangan) as {
      signature_id: string;
      signed_at: string;
    };
    expect(metadata.signature_id).toBe(
      portalCorrespondenceSignatureId(document.id, document.nomor),
    );
    expect(metadata.signed_at).toBe('2026-10-07T10:00:00.000Z');
    expect(update.status).toBe('final_tte');
  });
});
