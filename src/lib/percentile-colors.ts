/** Five heat stages for an already prepared 0–100 historical/risk-appetite rank.
 * Do not infer a rank from raw values or reverse upstream-normalized US factors.
 * Shared text/fill colors meet 4.5:1 on page and hover surfaces in both themes. */
export const PERCENTILE_COLORS = {
  light: ['#336b50', '#566a40', '#766330', '#965137', '#a9443b'],
  dark: ['#79b699', '#a8bd85', '#c8bd83', '#d8ab83', '#e59b89'],
} as const;

/** [0,20), [20,40), [40,60), [60,80), [80,100]. Invalid/missing stays neutral. */
export function percentileStage(percentile: number | null): number | undefined {
  if (percentile === null || !Number.isFinite(percentile) || percentile < 0 || percentile > 100) return undefined;
  return Math.min(4, Math.floor(percentile / 20));
}

export function percentileColor(percentile: number | null, scheme: 'light' | 'dark'): string | undefined {
  const stage = percentileStage(percentile);
  return stage === undefined ? undefined : PERCENTILE_COLORS[scheme][stage];
}

export function percentileColorStyle(percentile: number | null) {
  return {
    '--percentile-light': percentileColor(percentile, 'light'),
    '--percentile-dark': percentileColor(percentile, 'dark'),
  };
}
