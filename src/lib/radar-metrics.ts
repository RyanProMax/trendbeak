import type { DailyBar, RadarMetric, RadarReadings } from "../market-types";

export const RADAR_HISTORY_LIMIT = 252, RADAR_HISTORY_MINIMUM = 60;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** SMA seed at period-1; thereafter alpha=2/(period+1). No zero or partial seed. */
export function emaSeries(closes: number[], period: number): (number | null)[] {
  if (!Number.isInteger(period) || period < 1) throw new Error("Invalid EMA period");
  const result: (number | null)[] = Array(closes.length).fill(null);
  if (closes.some(value => !finite(value) || value <= 0) || closes.length < period) return result;
  let value = mean(closes.slice(0, period));
  result[period - 1] = value;
  const alpha = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) { value += alpha * (closes[i] - value); result[i] = value; }
  return result;
}

/** BB(20,2): population sigma (divide by N); width is a percent of SMA20. */
export function bollingerWidth(closes: number[]): number | null {
  if (closes.length < 20) return null;
  const window = closes.slice(-20);
  if (window.some(value => !finite(value) || value <= 0)) return null;
  const center = mean(window), variance = mean(window.map(value => (value - center) ** 2));
  return 4 * Math.sqrt(variance) / center * 100;
}

/** Same-instrument volume only. Missing/zero vendor volume is not an invented observation. */
export function relativeVolume(bars: DailyBar[]): number | null {
  if (bars.length < 21) return null;
  const values = bars.slice(-21).map(bar => bar.volume);
  if (values.some(value => !finite(value) || value <= 0)) return null;
  return values[20]! / mean(values.slice(0, 20) as number[]);
}

/** Empirical midrank, excluding this observation. A flat valid sample ranks 50; absent history is null. */
export function historicalRank(value: number | null, previous: (number | null)[]): { score: number | null; samples: number } {
  const history = previous.filter(finite).slice(-RADAR_HISTORY_LIMIT), samples = history.length;
  if (!finite(value) || samples < RADAR_HISTORY_MINIMUM) return { score: null, samples };
  const less = history.filter(item => item < value).length, equal = history.filter(item => item === value).length;
  return { score: (less + equal / 2) / samples * 100, samples };
}

/** Every row is calculated using its own prefix; a live volume bar uses only the previous complete session. */
export function buildRadarReadings(bars: DailyBar[], trading = false): Record<string, RadarReadings> {
  const closes = bars.map(bar => bar.close), fast = emaSeries(closes, 20), slow = emaSeries(closes, 60);
  const ema = closes.map((_, i) => fast[i] !== null && slow[i] !== null ? (fast[i]! / slow[i]! - 1) * 100 : null);
  const volatility = closes.map((_, i) => bollingerWidth(closes.slice(Math.max(0, i - 19), i + 1)));
  const activity = bars.map((_, i) => relativeVolume(bars.slice(Math.max(0, i - 20), i + 1)));
  const metric = (values: (number | null)[], index: number): RadarMetric => {
    if (index < 0) return { value: null, score: null, samples: 0, asOf: bars[0].date };
    const value = values[index];
    return { value, ...historicalRank(value, values.slice(0, index)), asOf: bars[index].date };
  };
  return Object.fromEntries(bars.map((bar, i) => [bar.date, { version: 1 as const,
    ema: metric(ema, i), volatility: metric(volatility, i),
    activity: metric(activity, trading && i === bars.length - 1 ? i - 1 : i),
  }]));
}
