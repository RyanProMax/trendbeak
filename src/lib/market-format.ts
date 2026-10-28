export function displayDate(date: string, full = false): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "日期未知";
  return new Intl.DateTimeFormat("zh-CN", {
    ...(full ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function number(
  value: number | null,
  digits = 2,
  signed = false,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${magnitude}`;
}

export function tone(value: number | null): string {
  return value === null || value === 0 ? "neutral" : value > 0 ? "up" : "down";
}
