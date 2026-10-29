import type { CalendarDay, MarketSnapshot } from "../market-types";
import { isExchangeClosed } from "./exchange-calendar";

const DAY = 86_400_000;
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

/** Align the two calendars without inventing quotes on the padded dates. */
export function calendarForRange(snapshot: MarketSnapshot, end: string, count = 365): CalendarDay[] {
  const known = new Map(snapshot.days.map((day) => [day.date, day]));
  return Array.from({ length: count }, (_, index) => {
    const date = shiftDate(end, index + 1 - count);
    const reading = snapshot.history?.[date];
    return known.get(date) ?? (reading ? { date, change: reading.change, status: "trading" } : {
      date, change: null,
      status: isExchangeClosed(date, snapshot.instrument.market) ? "closed" : "missing",
    });
  });
}

export function sentimentState(value: number | null) {
  if (value === null) return "暂无数据";
  return value < 25 ? "极度恐惧" : value < 45 ? "恐惧" : value <= 55 ? "中性" : value <= 75 ? "贪婪" : "极度贪婪";
}

export interface ChartPoint { date: string; value: number }
/** Gaps in trading-day observations split paths; weekends/holidays do not. */
export function chartSegments(days: CalendarDay[], observations: ChartPoint[]): ChartPoint[][] {
  const values = new Map(observations.map((point) => [point.date, point.value]));
  const segments: ChartPoint[][] = [];
  let segment: ChartPoint[] = [];
  for (const day of days) {
    const value = values.get(day.date);
    if (value !== undefined && Number.isFinite(value)) segment.push({ date: day.date, value });
    else if (day.status !== "closed" && segment.length) {
      segments.push(segment); segment = [];
    }
  }
  if (segment.length) segments.push(segment);
  return segments;
}

export const TREND_RANGES = [30, 90, 180, 365] as const;

/** Window selection is independent of the inspected/calendar date. */
export function trendSeries(snapshot: MarketSnapshot, benchmark: MarketSnapshot | null, end: string, range: number) {
  const start = shiftDate(end, 1 - range);
  const days = calendarForRange(snapshot, end, range).filter((day) => day.date >= start);
  const mood = (snapshot.sentiment?.observations ?? []).filter((point) => point.date >= start && point.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const prices = Object.entries(benchmark?.history ?? {}).filter(([date]) => date >= start && date <= end).sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({ date, value: row.price }));
  return { start, end, days, mood, prices,
    moodSegments: chartSegments(days, mood),
    priceSegments: chartSegments(benchmark ? calendarForRange(benchmark, end, range).filter((day) => day.date >= start) : days, prices),
  };
}

/** Exact-date observations only: never substitute a neighbouring session. */
export function trendReading(snapshot: MarketSnapshot, benchmark: MarketSnapshot | null, date: string) {
  return {
    date,
    mood: snapshot.sentiment?.observations.find((point) => point.date === date)?.value ?? null,
    price: benchmark?.history[date]?.price ?? null,
    closed: isExchangeClosed(date, snapshot.instrument.market),
  };
}
