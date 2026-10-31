export type Market = "CN" | "US";
export type TrendRange = number;

export interface Instrument {
  symbol: string;
  code: string;
  name: string;
  market: Market;
  kind: "index" | "stock";
}

export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface Signal {
  id: "sentiment" | "rsi" | "trend" | "volume" | "range";
  name: string;
  period: string;
  value: number | null;
  previous: number | null;
  min: number;
  max: number;
  unit: string;
  digits: number;
  labels: [string, string, string];
  explanation: string;
  unavailable: string | null;
  source?: { name: string; url: string };
  note?: string;
  previousLabel?: string;
}

export type TechnicalValues = Record<
  "rsi" | "trend" | "volume" | "range",
  number | null
>;
export type RadarMetricId = "ema" | "volatility" | "activity";
export interface RadarMetric {
  value: number | null;
  score: number | null;
  asOf: string;
  samples: number;
}
export interface RadarReadings {
  version: 1;
  ema: RadarMetric;
  volatility: RadarMetric;
  activity: RadarMetric;
}
export interface HistoricalReading {
  price: number;
  change: number | null;
  radar?: RadarReadings;
  values: TechnicalValues;
  previous: TechnicalValues;
  range: { low: number; high: number } | null;
}
export interface SentimentObservation {
  date: string; value: number; previous: number | null;
  observedAt?: string;
  dateKind?: "utc-date" | "market-time";
  source?: { name: string; url: string };
}
export interface SentimentData {
  historySeed?: { sha256: string; source: { name: string; url: string }; through: string; generatedAt: string };
  source: { name: string; url: string };
  description: string;
  observations: SentimentObservation[];
  error?: string;
  historyUnavailable?: string;
}

export interface CalendarDay {
  date: string;
  change: number | null;
  status: "trading" | "closed" | "missing";
}

export interface MarketSnapshot {
  freshness?: { state: "fresh" | "stale"; storedAt: string; ageSeconds: number; freshTtlSeconds: number; maxAgeSeconds: number; via: "upstream" | "memory" | "edge" | "browser" };
  instrument: Instrument;
  asOf: string;
  fetchedAt: string;
  session: "trading" | "closed";
  price: number;
  change: number | null;
  currency: string;
  days: CalendarDay[];
  signals: Signal[];
  history: Record<string, HistoricalReading>;
  sentiment?: SentimentData;
  source: { name: string; url: string };
}

export interface MarketState {
  retryable?: boolean;
  instrument: Instrument;
  snapshot: MarketSnapshot | null;
  error: string | null;
}

export interface PageData {
  markets: Record<Market, MarketState>;
  requestUrl: string;
}

export const BENCHMARKS: Record<Market, Instrument> = {
  CN: {
    symbol: "000300.SS",
    code: "000300",
    name: "沪深 300",
    market: "CN",
    kind: "index",
  },
  US: {
    symbol: "^GSPC",
    code: "SPX",
    name: "标普 500",
    market: "US",
    kind: "index",
  },
};
