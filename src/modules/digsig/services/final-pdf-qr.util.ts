import { createHash } from 'crypto';

/** Bind a QR to its document and number, rather than a temporary storage path. */
export function finalPdfQrReference(id: string, nomor: string): string {
  return createHash('sha256')
    .update(JSON.stringify([id, nomor]))
    .digest('hex')
    .slice(0, 24);
}

export function finalPdfQrUrl(id: string, nomor: string): string {
  const base = (
    process.env.QR_PDF_BASE_URL ||
    'https://new-arsipku-be.airnavindonesia.co.id'
  ).replace(/\/+$/, '');
  return `${base}/digsig/pdf/${encodeURIComponent(id)}?ref=${finalPdfQrReference(id, nomor)}`;
}
