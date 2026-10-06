import { isEvpOrAbovePosition } from './evp-access.helper';

describe('isEvpOrAbovePosition', () => {
  it('allows EVP and higher positions from position text', () => {
    expect(isEvpOrAbovePosition({ positionText: 'EVP Technology' })).toBe(true);
    expect(
      isEvpOrAbovePosition({ positionText: 'Executive Vice President Technology' }),
    ).toBe(true);
    expect(isEvpOrAbovePosition({ positionText: 'Direktur Utama' })).toBe(true);
    expect(isEvpOrAbovePosition({ positionText: 'PT. EVP Technology' })).toBe(
      true,
    );
  });

  it('allows profiles whose senior position is available as abbreviation', () => {
    expect(isEvpOrAbovePosition({ abbreviation: 'EVP', positionText: 'Pejabat' })).toBe(true);
  });

  it('allows director BOD tags only', () => {
    expect(isEvpOrAbovePosition({ bodTag: 'BOD' })).toBe(true);
    expect(isEvpOrAbovePosition({ bodTag: 'BOD-1' })).toBe(true);
    expect(isEvpOrAbovePosition({ bodTag: 'BOD-2' })).toBe(false);
    expect(isEvpOrAbovePosition({ bodTag: 'BOD-3' })).toBe(false);
  });

  it('rejects positions below EVP', () => {
    expect(isEvpOrAbovePosition({ positionText: 'VP Operations' })).toBe(false);
    expect(isEvpOrAbovePosition({ positionText: 'AVP Finance' })).toBe(false);
    expect(isEvpOrAbovePosition({ positionText: 'Staff' })).toBe(false);
  });
});
