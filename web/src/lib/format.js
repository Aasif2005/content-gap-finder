export const compact = (n) => {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
};

export const pct = (x) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;

export const duration = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}:${String(sec).padStart(2, '0')}`;
};

export const ago = (days) => {
  if (days < 1) return `${Math.round(days * 24)}h ago`;
  if (days < 30) return `${Math.round(days)}d ago`;
  return `${Math.round(days / 30)}mo ago`;
};

/** Cool -> hot ramp, used for heat bars and rank chips. */
export const heatColor = (heat) =>
  heat >= 70 ? 'var(--color-heat-high)' : heat >= 40 ? 'var(--color-heat-mid)' : 'var(--color-heat-low)';
