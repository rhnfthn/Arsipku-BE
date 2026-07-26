/**
 * Format Date object ke string WIB tanpa timezone suffix.
 * Output: "YYYY-MM-DD HH:mm:ss"
 * Berguna untuk response JSON agar FE bisa langsung tampilkan waktu WIB.
 */
export const formatWibDateTime = (
  date: Date | string | null | undefined,
): string | null => {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};
