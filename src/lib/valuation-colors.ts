import { COLORS, DARK_COLORS } from './heatmap-colors';

// Reuse the heatmap endpoints and a warm brand midpoint. The light midpoint
// is darker so even the thin fill remains distinct from its pale track.
const MIDPOINT = { light: '#9a885b', dark: '#c8bd83' };

/** Color an already prepared percentile; never calculate or change its rank. */
export function valuationPercentileColor(percentile: number | null, scheme: 'light' | 'dark'): string | undefined {
  if (percentile === null || !Number.isFinite(percentile) || percentile < 0 || percentile > 100) return undefined;
  const colors = scheme === 'dark' ? DARK_COLORS : COLORS;
  const stops = [colors[0], MIDPOINT[scheme], colors[8]];
  const segment = percentile <= 50 ? 0 : 1;
  const weight = (percentile - segment * 50) / 50;
  const from = stops[segment], to = stops[segment + 1];
  return `#${[1, 3, 5].map(index => {
    const a = parseInt(from.slice(index, index + 2), 16);
    const b = parseInt(to.slice(index, index + 2), 16);
    return Math.round(a + (b - a) * weight).toString(16).padStart(2, '0');
  }).join('')}`;
}
