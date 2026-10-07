import { DigsigService } from './digsig.service';
import { portalCorrespondenceSignatureId } from '../../tte-portal/helpers/portal-correspondence-signature';

function setup(status: string) {
  const signatureId = portalCorrespondenceSignatureId(
    'document',
    '001/TNG/X/2026',
  );
  const document = {
    status,
    jenis: 'ND',
    nomor: '001/TNG/X/2026',
    tanggal: new Date(),
    perihal: 'Uji',
    final_pdf: 'signed.pdf',
    tandaTangan: JSON.stringify({
      mode: 'portal',
      signature_id: signatureId,
      signed_at: '2026-10-07T10:00:00Z',
      signer_name: 'Signer',
    }),
  };
  const repository = { findOne: jest.fn().mockResolvedValue(document) };
  const service = Object.create(DigsigService.prototype) as DigsigService;
  Object.defineProperty(service, 'naskahRepository', { value: repository });
  return { service, signatureId, repository, document };
}

describe('Portal client QR verification', () => {
  it.each(['draf', 'pending_tte'])(
    'never verifies a %s document as signed',
    async (status) => {
      const state = setup(status);
      expect(
        (await state.service.verifyBySignatureId(state.signatureId)).valid,
      ).toBe(false);
    },
  );
  it('resolves the reference from the current naskah table only after completion', async () => {
    const state = setup('final_tte');
    expect(await state.service.verifyBySignatureId(state.signatureId)).toEqual(
      expect.objectContaining({
        valid: true,
        document: expect.objectContaining({
          status: 'final_tte',
          signed_at: '2026-10-07T10:00:00Z',
        }),
      }),
    );
  });
  it('does not validate a cancelled or missing QR reference', async () => {
    const state = setup('final_tte');
    state.repository.findOne.mockResolvedValue(null);
    expect(
      (await state.service.verifyBySignatureId(state.signatureId)).valid,
    ).toBe(false);
  });
  it('requires the persisted signed PDF', async () => {
    const state = setup('final_tte');
    state.document.final_pdf = '';
    expect(
      (await state.service.verifyBySignatureId(state.signatureId)).valid,
    ).toBe(false);
  });
});
