export type SifatLanguage = 'id' | 'en';

const SIFAT_LABELS: Record<SifatLanguage, Record<string, string>> = {
  id: {
    biasa: 'Biasa',
    terbuka: 'Terbuka',
    terbatas: 'Terbatas',
    rahasia: 'Rahasia',
    sangat_rahasia: 'Sangat Rahasia',
  },
  en: {
    biasa: 'Regular',
    terbuka: 'Open',
    terbatas: 'Limited',
    rahasia: 'Confidential',
    sangat_rahasia: 'Top Secret',
  },
};

export function normalizeSifat(value?: string | null): string {
  return String(value || 'biasa')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function formatSifatLabel(
  value?: string | null,
  language: SifatLanguage = 'id',
): string {
  const normalized = normalizeSifat(value);
  return SIFAT_LABELS[language][normalized] || String(value || 'Biasa');
}
