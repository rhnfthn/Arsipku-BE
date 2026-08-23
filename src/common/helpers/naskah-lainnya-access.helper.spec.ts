import { PositionStatus } from '../enums/position-status.enum';
import { canAccessNaskahLainnya } from './naskah-lainnya-access.helper';

describe('canAccessNaskahLainnya', () => {
  it('SE/VI/EXT → false (blocked)', () => {
    expect(canAccessNaskahLainnya(PositionStatus.SE)).toBe(false);
    expect(canAccessNaskahLainnya(PositionStatus.VI)).toBe(false);
    expect(canAccessNaskahLainnya(PositionStatus.EXT)).toBe(false);
  });

  it('YBS/PT/PH/PS → true (allow, aliran normal)', () => {
    expect(canAccessNaskahLainnya(PositionStatus.YBS)).toBe(true);
    expect(canAccessNaskahLainnya(PositionStatus.PT)).toBe(true);
    expect(canAccessNaskahLainnya(PositionStatus.PH)).toBe(true);
    expect(canAccessNaskahLainnya(PositionStatus.PS)).toBe(true);
  });

  it('null/undefined → true (no delegation = YBS)', () => {
    expect(canAccessNaskahLainnya(null)).toBe(true);
    expect(canAccessNaskahLainnya(undefined)).toBe(true);
  });

  it('string kosong / unknown → true (bukan status blocked)', () => {
    expect(canAccessNaskahLainnya('')).toBe(true);
    expect(canAccessNaskahLainnya('UNKNOWN')).toBe(true);
  });
});
