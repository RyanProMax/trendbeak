import type {
  CalendarDay,
  DailyBar,
  Signal,
  HistoricalReading,
  MarketSnapshot,
  TechnicalValues,
  Market,
} from "../market-types";
import { number } from "./market-format";
import { isExchangeClosed } from "./exchange-calendar";
import { buildRadarReadings } from "./radar-metrics";

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const DAY = 86_400_000;

export function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function marketDate(time: number, market: "CN" | "US"): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: market === "CN" ? "Asia/Shanghai" : "America/New_York",
  }).format(new Date(time));
}

export function validateBars(input: DailyBar[], today: string): DailyBar[] {
  const seen = new Set<string>();
  const rows: DailyBar[] = [];
  for (const bar of input) {
    if (!isDate(bar.date) || bar.date > today)
      throw new Error("Invalid market date");
    if (seen.has(bar.date)) throw new Error("Duplicate daily bar");
    seen.add(bar.date);
    if (
      ![bar.open, bar.high, bar.low, bar.close].every(
        (value) => finite(value) && value > 0,
      )
    )
      throw new Error("Invalid OHLC prices");
    const tolerance = Math.max(0.02, bar.close * 0.00001);
    if (
      bar.low > Math.min(bar.open, bar.close) + tolerance ||
      bar.high < Math.max(bar.open, bar.close) - tolerance ||
      bar.low > bar.high
    )
      throw new Error("Invalid OHLC range");
    if (bar.volume !== null && (!finite(bar.volume) || bar.volume < 0))
      throw new Error("Invalid volume");
    rows.push(bar);
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Wilder RSI: seed with a simple mean, then Wilder's 1/period smoothing. */
export function rsi(closes: number[], period = 14): number | null {
  if (
    closes.length <= period ||
    closes.some((value) => !finite(value) || value <= 0)
  )
    return null;
  let gain = 0,
    loss = 0;
  for (let index = 1; index <= period; index++) {
    const difference = closes[index] - closes[index - 1];
    gain += Math.max(0, difference);
    loss += Math.max(0, -difference);
  }
  gain /= period;
  loss /= period;
  for (let index = period + 1; index < closes.length; index++) {
    const difference = closes[index] - closes[index - 1];
    gain = (gain * (period - 1) + Math.max(0, difference)) / period;
    loss = (loss * (period - 1) + Math.max(0, -difference)) / period;
  }
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function trend(bars: DailyBar[]): number | null {
  if (bars.length < 20) return null;
  return (
    (bars.at(-1)!.close / mean(bars.slice(-20).map((bar) => bar.close)) - 1) *
    100
  );
}

function volumeRatio(bars: DailyBar[]): number | null {
  if (bars.length < 21) return null;
  const latest = bars.at(-1)!.volume;
  const previous = bars.slice(-21, -1).map((bar) => bar.volume);
  if (
    !finite(latest) ||
    latest <= 0 ||
    previous.some((value) => !finite(value) || value <= 0)
  )
    return null;
  return latest / mean(previous as number[]);
}

export function rangeBounds(
  bars: DailyBar[],
): { low: number; high: number } | null {
  if (bars.length < 2) return null;
  const last = bars.at(-1)!;
  const cutoff = new Date(Date.parse(last.date) - 364 * DAY)
    .toISOString()
    .slice(0, 10);
  // Do not call an IPO's short history a complete 52-week range.
  if (bars[0].date > cutoff) return null;
  const year = bars.filter((bar) => bar.date >= cutoff);
  const low = Math.min(...year.map((bar) => bar.low));
  const high = Math.max(...year.map((bar) => bar.high));
  return { low, high };
}

function rangePosition(bars: DailyBar[]): number | null {
  const bounds = rangeBounds(bars);
  if (!bounds) return null;
  return bounds.high === bounds.low
    ? 50
    : ((bars.at(-1)!.close - bounds.low) / (bounds.high - bounds.low)) * 100;
}

export function calculateSignals(bars: DailyBar[], trading = false): Signal[] {
  const prior = bars.slice(0, -1);
  const descriptors = [
    {
      id: "rsi",
      name: "RSI",
      period: "14 日",
      unit: "",
      digits: 1,
      min: 0,
      max: 100,
      labels: ["0", "50", "100"],
      explanation:
        "14 日相对强弱指标，采用 Wilder 平滑。低于 30 为超卖，高于 70 为超买。",
      calculate: (rows: DailyBar[]) => rsi(rows.map((bar) => bar.close)),
      unavailable: "历史日线不足 15 个交易日。",
    },
    {
      id: "trend",
      name: "趋势偏离",
      period: "20 日",
      unit: "%",
      digits: 1,
      min: -10,
      max: 10,
      labels: ["≤−10%", "0", "≥+10%"],
      explanation:
        "（最新价 ÷ 20 日收盘均价 − 1）× 100%。正值表示价格高于均线；超出刻度的读数仍显示实际数值。",
      calculate: trend,
      unavailable: "历史日线不足 20 个交易日。",
    },
    {
      id: "volume",
      name: "量能比",
      period: "20 日",
      unit: "×",
      digits: 2,
      min: 0,
      max: 2,
      labels: ["0", "1×", "≥2×"],
      explanation:
        "当日成交量 ÷ 前 20 个交易日均量。大于 1 为放量，小于 1 为缩量；仅比较完整交易日。",
      calculate: volumeRatio,
      unavailable: trading
        ? "尚未收盘，完整交易日量能比将在收盘后计算。"
        : "缺少完整的成交量数据。",
    },
    {
      id: "range",
      name: "52 周位置",
      period: "价格区间",
      unit: "%",
      digits: 0,
      min: 0,
      max: 100,
      labels: ["0 低点", "50", "100 高点"],
      explanation:
        "所选日价格在此前 52 周高低价区间中的位置：0% 为低点，100% 为高点。这是价格位置，不是上涨概率或估值分位。",
      calculate: rangePosition,
      unavailable: "历史日线不足 52 周。",
    },
  ] as const;
  return descriptors.map(({ calculate, unavailable, ...descriptor }) => {
    const value =
      descriptor.id === "volume" && trading ? null : calculate(bars);
    return {
      ...descriptor,
      labels: [...descriptor.labels],
      value,
      previous: calculate(prior),
      unavailable: value === null ? unavailable : null,
    };
  });
}

/** Each historical row sees only bars available through that day. */
export function buildHistory(
  bars: DailyBar[],
  through: string,
  trading = false,
): Record<string, HistoricalReading> {
  const cutoff = new Date(Date.parse(through) - 729 * DAY)
    .toISOString()
    .slice(0, 10);
  const history: Record<string, HistoricalReading> = {};
  const radar = buildRadarReadings(bars, trading);
  bars.forEach((bar, index) => {
    if (bar.date < cutoff || bar.date > through) return;
    const prefix = bars.slice(0, index + 1);
    const signals = calculateSignals(
      prefix,
      trading && index === bars.length - 1,
    );
    history[bar.date] = {
      price: bar.close,
      radar: radar[bar.date],
      change: index ? (bar.close / bars[index - 1].close - 1) * 100 : null,
      values: Object.fromEntries(
        signals.map((s) => [s.id, s.value]),
      ) as TechnicalValues,
      previous: Object.fromEntries(
        signals.map((s) => [s.id, s.previous]),
      ) as TechnicalValues,
      range: rangeBounds(prefix),
    };
  });
  return history;
}

export function signalsForDate(
  snapshot: MarketSnapshot,
  date: string,
): Signal[] {
  const reading = snapshot.history[date];
  const day = snapshot.days.find((item) => item.date === date);
  const missing =
    day?.status === "closed" ? "休市，无当日指标。" : "当日无交易数据。";
  const reasons = {
    rsi: "历史日线不足 15 个交易日。",
    trend: "历史日线不足 20 个交易日。",
    volume:
      date === snapshot.asOf && snapshot.session === "trading"
        ? "尚未收盘，完整交易日量能比将在收盘后计算。"
        : "缺少完整的成交量数据。",
    range: "历史日线不足 52 周。",
  };
  const technical = snapshot.signals.map((signal) => {
    const id = signal.id as keyof TechnicalValues;
    const value = reading?.values[id] ?? null;
    return {
      ...signal,
      value,
      previous: reading?.previous[id] ?? null,
      unavailable: !reading ? missing : value === null ? reasons[id] : null,
      note:
        id === "range" && reading?.range
          ? `52 周低点 ${number(reading.range.low)} · 高点 ${number(reading.range.high)}`
          : undefined,
    };
  });
  const sentiment = snapshot.sentiment;
  const observation = sentiment?.observations.find(
    (item) => item.date === date,
  );
  const market = snapshot.instrument.market;
  const fearGreed: Signal = {
    id: "sentiment",
    name: "贪恐指数",
    period: market === "CN" ? "A 股·自编" : "美股·CNN",
    min: 0,
    max: 100,
    unit: "",
    digits: 1,
    labels: ["0 恐惧", "50", "100 贪婪"],
    value: observation?.value ?? null,
    previous: observation?.previous ?? null,
    explanation:
      sentiment?.description ?? "反映整个市场的情绪，不是单只股票的评分。",
    unavailable: observation ? null : (sentiment?.error ?? "该日贪恐读数暂缺。"),
    source: observation?.source ?? sentiment?.source,
    previousLabel: "前次发布",
    note: sentiment?.historyUnavailable,
  };
  return [fearGreed, ...technical];
}

export function buildCalendar(
  bars: DailyBar[],
  through: string,
  market?: Market,
): CalendarDay[] {
  const values = new Map<string, number | null>();
  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index],
      previous = bars[index - 1];
    values.set(
      bar.date,
      previous ? (bar.close / previous.close - 1) * 100 : null,
    );
  }
  const end = Date.parse(through);
  return Array.from({ length: 365 }, (_, index) => {
    const time = end - (364 - index) * DAY;
    const date = new Date(time).toISOString().slice(0, 10);
    const change = values.get(date) ?? null;
    return {
      date,
      change,
      status: values.has(date)
        ? "trading"
        : isExchangeClosed(date, market)
          ? "closed"
          : "missing",
    };
  });
}
