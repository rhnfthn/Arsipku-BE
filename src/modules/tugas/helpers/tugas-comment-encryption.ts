import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ValueTransformer } from 'typeorm';

const PREFIX = 'tugas-chat:v1:';
const AAD = Buffer.from('arsipku:tugas_task_comment:isi:v1');

export function commentEncryptionKey(): Buffer {
  const value = process.env.TUGAS_COMMENT_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error(
      'TUGAS_COMMENT_ENCRYPTION_KEY wajib berisi 64 karakter hex (32 byte)',
    );
  }
  return Buffer.from(value, 'hex');
}

export function encryptComment(value: string): string {
  const key = commentEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return (
    PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
  );
}

export function isEncryptedComment(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function decryptComment(value: string): string {
  // Compatibility during backfill. New writes always encrypt, including tombstones.
  if (!isEncryptedComment(value)) return value;
  const key = commentEncryptionKey();
  try {
    const encoded = value.slice(PREFIX.length);
    const payload = Buffer.from(encoded, 'base64');
    if (payload.length < 28 || payload.toString('base64') !== encoded)
      throw new Error();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      payload.subarray(0, 12),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Isi pesan forum gagal didekripsi');
  }
}

export const tugasCommentEncryptionTransformer: ValueTransformer = {
  to: encryptComment,
  from: decryptComment,
};
