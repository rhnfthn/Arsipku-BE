/**
 * Bangun regex dari format penomoran (placeholder) untuk validasi nomor manual.
 * Placeholder → pattern:
 *  {TIPE}        → kode jenis (escape regex)
 *  {NO_URUT}     → \d{3}
 *  {JABATAN}     → [^/]+
 *  {LOKASI}      → \d{2}
 *  {INSTANSI}    → LPPNPI
 *  {KLASIFIKASI} → [^/]+
 *  {BULAN}       → [IVXLCDM]+
 *  {TAHUN}       → \d{4}
 *
 * Anchor penuh (^...$). Titik setelah {TIPE} di-escape.
 */
export function buildNomorRegex(format: string, jenis: string): RegExp {
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = format
    .replace(/{TIPE}/g, escapeRegex(jenis))
    .replace(/{NO_URUT}/g, '\\d{3}')
    .replace(/{JABATAN}/g, '[^/]+')
    .replace(/{LOKASI}/g, '\\d{2}')
    .replace(/{INSTANSI}/g, 'LPPNPI')
    .replace(/{KLASIFIKASI}/g, '[^/]+')
    .replace(/{BULAN}/g, '[IVXLCDM]+')
    .replace(/{TAHUN}/g, '\\d{4}');
  return new RegExp(`^${pattern}$`);
}
