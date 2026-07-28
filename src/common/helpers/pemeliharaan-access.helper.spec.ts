import { PositionStatus } from '../enums/position-status.enum';
import { getEffectivePemeliharaanRole } from './pemeliharaan-access.helper';

describe('getEffectivePemeliharaanRole', () => {
  it('SE & PS → pemberkasan (aktor delegated non-managerial)', () => {
    expect(getEffectivePemeliharaanRole(PositionStatus.SE, 'BOD')).toBe('pemberkasan');
    expect(getEffectivePemeliharaanRole(PositionStatus.PS, 'BOD-2')).toBe('pemberkasan');
  });

  it('PT & PH → persetujuan (aktor delegated managerial, warisi)', () => {
    expect(getEffectivePemeliharaanRole(PositionStatus.PT, '')).toBe('persetujuan');
    expect(getEffectivePemeliharaanRole(PositionStatus.PH, '')).toBe('persetujuan');
  });

  it('VI & EXT → null (bukan aktor pemeliharaan)', () => {
    expect(getEffectivePemeliharaanRole(PositionStatus.VI, 'BOD')).toBeNull();
    expect(getEffectivePemeliharaanRole(PositionStatus.EXT, '')).toBeNull();
  });

  it('YBS bodTag BOD/BOD-1/BOD-2/BOD-3 → persetujuan', () => {
    expect(getEffectivePemeliharaanRole(null, 'BOD')).toBe('persetujuan');
    expect(getEffectivePemeliharaanRole(null, 'BOD-1')).toBe('persetujuan');
    expect(getEffectivePemeliharaanRole(null, 'BOD-2')).toBe('persetujuan');
    expect(getEffectivePemeliharaanRole(null, 'BOD-3')).toBe('persetujuan');
  });

  it('YBS bodTag kosong → pemberkasan (non-managerial)', () => {
    expect(getEffectivePemeliharaanRole(null, '')).toBe('pemberkasan');
    expect(getEffectivePemeliharaanRole(undefined, undefined)).toBe('pemberkasan');
  });

  it('mengabaikan bodTag delegator saat position_status delegated', () => {
    // SE bawa bodTag=BOD (delegator) → tetap pemberkasan, bukan persetujuan
    expect(getEffectivePemeliharaanRole(PositionStatus.SE, 'BOD')).toBe('pemberkasan');
    // PT bawa bodTag='' → tetap persetujuan
    expect(getEffectivePemeliharaanRole(PositionStatus.PT, '')).toBe('persetujuan');
  });
});
