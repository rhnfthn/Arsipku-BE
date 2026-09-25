import { formatSifatLabel, normalizeSifat } from './sifat.helper';

describe('sifat helper', () => {
  it('normalizes legacy values that contain spaces', () => {
    expect(normalizeSifat('Sangat Rahasia')).toBe('sangat_rahasia');
  });

  it('formats sifat for Indonesian templates', () => {
    expect(formatSifatLabel('sangat_rahasia')).toBe('Sangat Rahasia');
  });

  it('formats sifat for English templates', () => {
    expect(formatSifatLabel('sangat_rahasia', 'en')).toBe('Top Secret');
  });
});
