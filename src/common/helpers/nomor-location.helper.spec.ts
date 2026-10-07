import { formatNomorLocation } from './nomor-location.helper';

describe('kode lokasi nomor baru', () => {
  it.each(['00', '0', '1000', ' 1000 ', 'TNG', 'tng'])(
    '%s memakai TNG',
    (area) => {
      expect(formatNomorLocation(area)).toBe('TNG');
    },
  );

  it.each([
    ['1001', '01'],
    ['1025', '25'],
    ['1', '01'],
  ])('cabang %s tetap %s', (area, code) => {
    expect(formatNomorLocation(area)).toBe(code);
  });

  it.each([null, undefined, '', ' '])(
    'area kosong tidak dianggap kantor pusat',
    (area) => {
      expect(formatNomorLocation(area)).toBe('');
    },
  );
});
