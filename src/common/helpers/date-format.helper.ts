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

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hours = get('hour');
  const minutes = get('minute');
  const seconds = get('second');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};
