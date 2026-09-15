import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const base64Url = (value: Buffer): string => value.toString('base64url');

export const generateOidcSessionId = (): string => base64Url(randomBytes(32));

export const generateCodeVerifier = (): string => base64Url(randomBytes(64));

export const generateCodeChallenge = (verifier: string): string =>
  base64Url(createHash('sha256').update(verifier).digest());

export const generateOidcState = (): string => base64Url(randomBytes(32));

export const safeStateEquals = (expected: string, actual: string): boolean => {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
};
