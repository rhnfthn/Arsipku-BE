import * as QRCode from 'qrcode';
import { QRCodeService, QRCodeData } from './qrcode.service';

const data: QRCodeData = {
  signature_id: 'SIG-TEST-A',
  document_number: '001/TEST/2026',
  signed_at: '2026-10-09T01:00:00Z',
  signer_name: 'Signer',
  signer_jabatan: 'Manager',
  document_type: 'ND',
  verification_url:
    'https://arsipku.airnavindonesia.co.id/verify/portal-' + 'a'.repeat(64),
};

describe('Final PDF QR renderer', () => {
  it('renders the original destination with the AirNav logo and consistent base64', async () => {
    const service = new QRCodeService();
    const buffer = await service.generateQRCodePngBuffer(data);
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(await service.generateQRCodeBuffer(data)).toEqual(
      await QRCode.toBuffer(data.verification_url!, {
        errorCorrectionLevel: 'H',
        margin: 4,
        scale: 8,
        type: 'png',
      }),
    );
    expect(await service.generateQRCodeBase64(data)).toBe(
      `data:image/png;base64,${buffer.toString('base64')}`,
    );
  });

  it('preserves PDF destination precedence and produces a plain QR when requested', async () => {
    const service = new QRCodeService();
    const withPdf = { ...data, pdf_url: 'https://storage.example/final.pdf' };
    const plain = await service.generateQRCodeBuffer(withPdf);
    const branded = await service.generateQRCodePngBuffer(withPdf);
    expect(plain).toEqual(
      await QRCode.toBuffer(withPdf.pdf_url, {
        errorCorrectionLevel: 'H',
        margin: 4,
        scale: 8,
        type: 'png',
      }),
    );
    expect(plain.equals(branded)).toBe(false);
  });

  it('keeps all fields of legacy manual-verification QR payloads', async () => {
    const service = new QRCodeService();
    const buffer = await service.generateQRCodeBuffer({
      ...data,
      verification_url: undefined,
    });
    const payload = {
      sig: data.signature_id,
      doc: data.document_number,
      date: data.signed_at,
      by: data.signer_name,
      type: data.document_type,
    };
    expect(buffer).toEqual(
      await QRCode.toBuffer(JSON.stringify(payload), {
        errorCorrectionLevel: 'H',
        margin: 4,
        scale: 8,
        type: 'png',
      }),
    );
  });
});
