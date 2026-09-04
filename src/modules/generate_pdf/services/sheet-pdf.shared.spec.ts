import { formatSheetPosition, formatTanggal } from './sheet-pdf.shared';

describe('sheet-pdf.shared', () => {
  describe('formatTanggal', () => {
    it('memformat YYYY-MM-DD ke "21 Agustus 2026"', () => {
      expect(formatTanggal('2026-08-21')).toBe('21 Agustus 2026');
    });

    it('mengembalikan string kosong untuk input kosong/invalid', () => {
      expect(formatTanggal(undefined)).toBe('');
      expect(formatTanggal('')).toBe('');
      expect(formatTanggal('bukan-tanggal')).toBe('');
    });
  });

  describe('formatSheetPosition', () => {
    it('menempatkan PH pada jabatan tepat satu kali', () => {
      expect(
        formatSheetPosition({ jabatan: 'Direktur Operasi', delegator: 'PH' }),
      ).toBe('PH. Direktur Operasi');
      expect(
        formatSheetPosition({
          jabatan: 'PH. Direktur Operasi',
          delegator: 'PH',
        }),
      ).toBe('PH. Direktur Operasi');
    });
  });
});
