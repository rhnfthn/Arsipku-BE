/**
 * Preset durasi akses (usulan dari pengusul, bisa disesuaikan oleh Sekretaris Pemberi)
 */
export enum DurasiPreset {
  TUJUH_HARI = '7_HARI',
  EMPAT_BELAS_HARI = '14_HARI',
  SATU_BULAN = '1_BULAN',
  DUA_BULAN = '2_BULAN',
  TIGA_BULAN = '3_BULAN',
  ENAM_BULAN = '6_BULAN',
  SATU_TAHUN = '1_TAHUN',
  CUSTOM = 'CUSTOM',
}

/**
 * Mapping preset → jumlah hari (untuk auto-calc tanggalSelesai)
 */
export const DURASI_PRESET_HARI: Record<Exclude<DurasiPreset, 'CUSTOM'>, number> = {
  [DurasiPreset.TUJUH_HARI]: 7,
  [DurasiPreset.EMPAT_BELAS_HARI]: 14,
  [DurasiPreset.SATU_BULAN]: 30,
  [DurasiPreset.DUA_BULAN]: 60,
  [DurasiPreset.TIGA_BULAN]: 90,
  [DurasiPreset.ENAM_BULAN]: 180,
  [DurasiPreset.SATU_TAHUN]: 365,
};