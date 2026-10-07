import { randomBytes } from 'node:crypto';
import { decryptComment, encryptComment } from './tugas-comment-encryption';

describe('Forum encryption', () => {
  const previousKey = process.env.TUGAS_COMMENT_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.TUGAS_COMMENT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });
  afterAll(() => {
    if (previousKey === undefined)
      delete process.env.TUGAS_COMMENT_ENCRYPTION_KEY;
    else process.env.TUGAS_COMMENT_ENCRYPTION_KEY = previousKey;
  });
  it.each(['Halo @Rini 👋', '', 'x'.repeat(2000)])(
    'round-trips messages and deletion tombstones',
    (message) => {
      const encrypted = encryptComment(message);
      expect(encrypted).not.toBe(message);
      expect(decryptComment(encrypted)).toBe(message);
    },
  );
  it('uses a fresh nonce for repeated messages', () => {
    expect(encryptComment('Halo')).not.toBe(encryptComment('Halo'));
  });
  it('rejects a wrong key', () => {
    const encrypted = encryptComment('Halo');
    process.env.TUGAS_COMMENT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    expect(() => decryptComment(encrypted)).toThrow('gagal didekripsi');
  });
  it('rejects tampered ciphertext and malformed envelopes', () => {
    const encrypted = encryptComment('Halo');
    const prefix = 'tugas-chat:v1:';
    const payload = Buffer.from(encrypted.slice(prefix.length), 'base64');
    payload[28] ^= 1;
    expect(() => decryptComment(prefix + payload.toString('base64'))).toThrow();
    expect(() => decryptComment(prefix + 'invalid')).toThrow();
  });
  it('never writes plaintext when configuration is missing or invalid', () => {
    delete process.env.TUGAS_COMMENT_ENCRYPTION_KEY;
    expect(() => encryptComment('Halo')).toThrow('wajib');
    process.env.TUGAS_COMMENT_ENCRYPTION_KEY = 'invalid';
    expect(() => encryptComment('Halo')).toThrow('wajib');
  });
  it('reads legacy messages during backfill', () => {
    expect(decryptComment('Pesan lama')).toBe('Pesan lama');
  });
});
