import { randomUUID } from 'crypto';

const randomToken = (): string =>
  randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

const normalizeJenis = (jenis: string): string =>
  String(jenis || 'NASKAH')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'NASKAH';

export const createCorrespondenceAttachmentFileName = (jenis: string): string =>
  `${normalizeJenis(jenis)}-${randomToken()}.pdf`;

export const createCorrespondenceFinalFileName = (
  jenis: string,
  attachmentCount: number,
): string =>
  `${normalizeJenis(jenis)}-${randomToken()}-${Math.max(0, attachmentCount)}.pdf`;
