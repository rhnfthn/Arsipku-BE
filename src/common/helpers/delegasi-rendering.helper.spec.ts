import { delegatedPengirimFields } from './delegasi-rendering.helper';
import { PositionStatus } from '../enums/position-status.enum';

describe('delegatedPengirimFields', () => {
  const basePositionText = 'EVP of PMO - Interim Officer';
  const fallbackName = 'Budi';

  it('YBS (no position_status): no prefix, fallback name, status ybs', () => {
    const r = delegatedPengirimFields(
      { position_status: null, nama: 'Siti' },
      basePositionText,
      fallbackName,
    );
    expect(r).toEqual({
      positionStatus: 'ybs',
      positionText: basePositionText,
      namaSirkuler: 'Budi',
    });
  });

  it('PT: prefix jabatan, delegate name, status PT', () => {
    const r = delegatedPengirimFields(
      { position_status: PositionStatus.PT, nama: 'Siti' },
      basePositionText,
      fallbackName,
    );
    expect(r).toEqual({
      positionStatus: 'PT',
      positionText: 'PT. EVP of PMO - Interim Officer',
      namaSirkuler: 'Siti',
    });
  });

  it('PH: prefix + delegate name', () => {
    const r = delegatedPengirimFields(
      { position_status: PositionStatus.PH, nama: 'Siti' },
      basePositionText,
      fallbackName,
    );
    expect(r.positionStatus).toBe('PH');
    expect(r.positionText).toBe('PH. EVP of PMO - Interim Officer');
    expect(r.namaSirkuler).toBe('Siti');
  });

  it('PS: prefix + delegate name', () => {
    const r = delegatedPengirimFields(
      { position_status: PositionStatus.PS, nama: 'Siti' },
      basePositionText,
      fallbackName,
    );
    expect(r.positionStatus).toBe('PS');
    expect(r.positionText).toBe('PS. EVP of PMO - Interim Officer');
    expect(r.namaSirkuler).toBe('Siti');
  });

  it('VI/SE treated as YBS (cannot send — never reached, but safe)', () => {
    const r = delegatedPengirimFields(
      { position_status: PositionStatus.VI, nama: 'Siti' },
      basePositionText,
      fallbackName,
    );
    expect(r.positionStatus).toBe('ybs');
    expect(r.positionText).toBe(basePositionText);
    expect(r.namaSirkuler).toBe('Budi');
  });

  it('delegated with empty nama: namaSirkuler empty (not fallback)', () => {
    const r = delegatedPengirimFields(
      { position_status: PositionStatus.PT, nama: '' },
      basePositionText,
      fallbackName,
    );
    expect(r.namaSirkuler).toBe('');
  });
});
