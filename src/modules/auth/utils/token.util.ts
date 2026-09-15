export const parseExpiresIn = (value: unknown, fallback = 3600): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) return Math.max(1, Number(value));

    const match = value.match(/^(\d+)(s|m|h|d)$/i);
    if (match) {
      const amount = Number(match[1]);
      const multipliers: Record<string, number> = {
        s: 1,
        m: 60,
        h: 3600,
        d: 86400,
      };
      const multiplier = multipliers[match[2].toLowerCase()] ?? 1;
      return amount * multiplier;
    }
  }

  return fallback;
};
