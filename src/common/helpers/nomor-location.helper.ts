/** Kode lokasi untuk nomor baru; kode area organisasi dan counter tetap asli. */
export function formatNomorLocation(area: string | null | undefined): string {
  if (!area) return '';
  const value = area.trim();
  if (!value) return '';
  if (value.toUpperCase() === 'TNG') return 'TNG';
  const code = value.length >= 2 ? value.slice(-2) : value.padStart(2, '0');
  return code === '00' ? 'TNG' : code;
}
