const DAY = 86_400_000;
function calendarDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

/** A reader-facing, month-rounded span of actual observations, not a claim of complete daily coverage. */
export function valuationCoverage(reading: { from?: string; through?: string; samples?: number }): string {
  const from = calendarDate(reading.from), through = calendarDate(reading.through);
  if (!from || !through || through < from || !Number.isInteger(reading.samples) || reading.samples! <= 0) return '—';
  // Include the last observed day. Nearest-month rounding absorbs trading-day
  // edges (e.g. a decade beginning on a weekend) without rounding short histories to ten years.
  const end = new Date(through.getTime() + DAY);
  let months = (end.getUTCFullYear() - from.getUTCFullYear()) * 12 + end.getUTCMonth() - from.getUTCMonth();
  const anchor = (offset: number) => {
    const first = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(from.getUTCDate(), lastDay));
    return first.getTime();
  };
  if (anchor(months) > end.getTime()) months--;
  months = Math.round(months + (end.getTime() - anchor(months)) / (anchor(months + 1) - anchor(months)));
  if (months < 1) return '不足 1 个月';
  const years = Math.floor(months / 12), remainder = months % 12;
  return `近 ${years ? `${years} 年` : ''}${years && remainder ? ' ' : ''}${remainder ? `${remainder} 个月` : ''}`;
}
