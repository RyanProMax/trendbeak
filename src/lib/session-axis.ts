import type { CalendarDay } from "../market-types";

/** Only confirmed closures disappear. Missing weekdays keep their slot. */
export function sessionAxis(days: CalendarDay[]) {
  const dates = days.filter(day => day.status !== "closed").map(day => day.date);
  const indices = new Map(dates.map((date, index) => [date, index]));
  const last = Math.max(0, dates.length - 1);
  const index = (date: string) => indices.get(date) ?? -1;
  const at = (position: number) => dates[Math.max(0, Math.min(last, Math.round(position)))] ?? null;
  return {
    dates, last, index,
    contains: (date: string) => indices.has(date),
    fraction: (date: string) => index(date) / Math.max(1, last),
    at,
    fromFraction: (fraction: number) => at(fraction * last),
    step: (date: string, delta: number) => {
      const current = index(date);
      if (current >= 0) return at(current + delta);
      const next = dates.findIndex(session => session > date);
      return at(delta < 0 ? (next < 0 ? dates.length : next) - 1 : next < 0 ? last : next);
    },
  };
}
