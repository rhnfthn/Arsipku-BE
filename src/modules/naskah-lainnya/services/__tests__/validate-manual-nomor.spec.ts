import { buildNomorRegex } from '../nomor-format.helper';

describe('buildNomorRegex', () => {
  it('PER (Pendek): {TIPE}.{NO_URUT}/{INSTANSI}/{BULAN}/{TAHUN}', () => {
    const re = buildNomorRegex('{TIPE}.{NO_URUT}/{INSTANSI}/{BULAN}/{TAHUN}', 'PER');
    expect(re.test('PER.001/LPPNPI/VIII/2026')).toBe(true);
    expect(re.test('PER.001/LPPNPI/8/2026')).toBe(false); // bulan harus romawi
    expect(re.test('KEP.001/LPPNPI/VIII/2026')).toBe(false); // tipe salah
  });

  it('KEP (Medium): {TIPE}.{NO_URUT}/{JABATAN}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}', () => {
    const re = buildNomorRegex(
      '{TIPE}.{NO_URUT}/{JABATAN}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}',
      'KEP',
    );
    expect(re.test('KEP.001/P/LPPNPI/PER.07/VIII/2026')).toBe(true);
    expect(re.test('KEP.001/P/LPPNPI/PER.07/VIII/2026/extra')).toBe(false); // extra segment
  });

  it('INS (Full): {TIPE}.{NO_URUT}/{JABATAN}/{LOKASI}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}', () => {
    const re = buildNomorRegex(
      '{TIPE}.{NO_URUT}/{JABATAN}/{LOKASI}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}',
      'INS',
    );
    expect(re.test('INS.001/P/00/LPPNPI/PER.07/VIII/2026')).toBe(true);
    expect(re.test('INS.001/P/00/LPPNPI/PER.07/VIII/2026')).toBe(true);
  });

  it('anchor penuh — tidak boleh ada char tambahan', () => {
    const re = buildNomorRegex('{TIPE}.{NO_URUT}/{INSTANSI}/{BULAN}/{TAHUN}', 'PER');
    expect(re.test('PER.001/LPPNPI/VIII/2026 trailing')).toBe(false);
  });
});
