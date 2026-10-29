import type { CalendarDay, MarketSnapshot } from "../market-types";
import { isExchangeClosed } from "./exchange-calendar";

const DAY = 86_400_000;
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

/** Align the two calendars without inventing quotes on the padded dates. */
export function calendarForRange(snapshot: MarketSnapshot, end: string): CalendarDay[] {
  const known = new Map(snapshot.days.map((day) => [day.date, day]));
  return Array.from({ length: 365 }, (_, index) => {
    const date = shiftDate(end, index - 364);
    return known.get(date) ?? {
      date, change: null,
      status: isExchangeClosed(date, snapshot.instrument.market) ? "closed" : "missing",
    };
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
