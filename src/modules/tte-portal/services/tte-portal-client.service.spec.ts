import { BadRequestException } from '@nestjs/common';
import { TtePortalClientService } from './tte-portal-client.service';

describe('TtePortalClientService helpers', () => {
  it('membuat state dan idempotency key yang sesuai kontrak portal', () => {
    const state = TtePortalClientService.generateState();
    const key = TtePortalClientService.generateIdempotencyKey();

    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(key).toMatch(/^arsipku-[!-~]+$/);
    expect(key).not.toContain(' ');
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
  });

  it('menolak artefak yang bukan PDF', () => {
    expect(() =>
      TtePortalClientService.assertPdf(Buffer.from('bukan-pdf'), 'Dokumen uji'),
    ).toThrow(BadRequestException);
  });

  it('menerima buffer dengan magic bytes PDF', () => {
    expect(() =>
      TtePortalClientService.assertPdf(
        Buffer.from('%PDF-1.7\ncontoh'),
        'Dokumen uji',
      ),
    ).not.toThrow();
  });
});
