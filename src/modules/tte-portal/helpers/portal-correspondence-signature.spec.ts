import { QRCodeService } from '../../digsig/services/qrcode.service';
import {
  portalCorrespondenceQrHtml,
  portalCorrespondenceSignatureId,
} from './portal-correspondence-signature';

describe('Client QR for Portal correspondence', () => {
  it.each(['ND', 'SDI', 'SDE', 'DI', 'KA'])(
    'embeds a real QR image for %s without premature signed metadata',
    async (jenis) => {
      const generateQRCodeBase64 = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,test');
      const html = await portalCorrespondenceQrHtml(
        { generateQRCodeBase64 } as unknown as QRCodeService,
        'document',
        '001/TNG/X/2026',
        jenis,
      );
      expect(html).toContain('<img src="data:image/png;base64,test"');
      expect(html).not.toContain('TTE_');
      expect(generateQRCodeBase64).toHaveBeenCalledWith(
        expect.objectContaining({
          document_id: 'document',
          signed_at: '',
          verification_url: expect.stringContaining(
            portalCorrespondenceSignatureId('document', '001/TNG/X/2026'),
          ),
        }),
      );
    },
  );
  it('uses a different QR reference after cancellation and reservation of a new number', () => {
    expect(
      portalCorrespondenceSignatureId('document', '001/TNG/X/2026'),
    ).not.toBe(portalCorrespondenceSignatureId('document', '002/TNG/X/2026'));
  });
});
