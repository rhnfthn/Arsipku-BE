import { createHash } from 'crypto';
import { QRCodeService } from '../../digsig/services/qrcode.service';

export function portalCorrespondenceSignatureOptions(jenis: string) {
  if (!['ND', 'SDI', 'SDE', 'DI', 'KA'].includes(jenis)) {
    throw new Error(`Unsupported correspondence signature template: ${jenis}`);
  }
  return { tampilan: 'INVISIBLE' as const };
}

/** Bind the QR to this number reservation; a cancelled attempt cannot verify a later retry. */
export function portalCorrespondenceSignatureId(
  idNaskah: string,
  nomor: string,
): string {
  return `portal-${createHash('sha256')
    .update(JSON.stringify([idNaskah, nomor]))
    .digest('hex')}`;
}

export async function portalCorrespondenceQrHtml(
  qrCodeService: QRCodeService,
  idNaskah: string,
  nomor: string,
  jenis: string,
): Promise<string> {
  portalCorrespondenceSignatureOptions(jenis);
  if (!idNaskah || !nomor)
    throw new Error('Konteks QR Portal TTE tidak lengkap');
  const signatureId = portalCorrespondenceSignatureId(idNaskah, nomor);
  const verificationBase = (
    process.env.VERIFICATION_URL ||
    'https://arsipku.airnavindonesia.co.id/verify'
  ).replace(/\/$/, '');
  const image = await qrCodeService.generateQRCodeBase64({
    signature_id: signatureId,
    document_number: nomor,
    signed_at: '', // Signing has not happened; completion supplies the actual timestamp.
    signer_name: '',
    signer_jabatan: '',
    document_type: jenis,
    verification_url: `${verificationBase}/${signatureId}`,
  });
  return `<img src="${image}" style="width:80px;height:80px;" alt="QR verifikasi TTE" />`;
}
