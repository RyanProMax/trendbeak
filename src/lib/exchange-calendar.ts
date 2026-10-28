import chinaCalendar from "../../data/china-exchange-calendar-2026.json";
import usCalendar from "../../data/us-exchange-calendar.json";
import type { Market } from "../market-types";

const usHolidays = new Set(usCalendar.closedDates);

/** Unknown weekday gaps remain missing; an absent quote alone is not a holiday. */
export function isExchangeClosed(date: string, market?: Market): boolean {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return true;
  if (market === "CN")
    return chinaCalendar.closedPeriods.some(([start, end]) => date >= start && date <= end);
  if (market === "US")
    return date >= usCalendar.verifiedFrom && date <= usCalendar.verifiedThrough && usHolidays.has(date);
  return false;
}
