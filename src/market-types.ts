export type Market = "CN" | "US";
export type TrendRange = 30 | 90 | 180 | 365;

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
export interface HistoricalReading {
  price: number;
  change: number | null;
  values: TechnicalValues;
  previous: TechnicalValues;
  range: { low: number; high: number } | null;
}
export interface SentimentData {
  source: { name: string; url: string };
  description: string;
  observations: { date: string; value: number; previous: number | null }[];
  error?: string;
  historyUnavailable?: string;
}

export interface CalendarDay {
  date: string;
  change: number | null;
  status: "trading" | "closed" | "missing";
}

export interface MarketSnapshot {
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
