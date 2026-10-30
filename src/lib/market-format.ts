const shortDate = new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",timeZone:"UTC"});
const fullDate = new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"});
const decimals = new Map<number,Intl.NumberFormat>();
export function displayDate(date: string, full = false): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "日期未知";
  return (full?fullDate:shortDate).format(parsed);
}

export function number(
  value: number | null,
  digits = 2,
  signed = false,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  let formatter=decimals.get(digits);
  if(!formatter){formatter=new Intl.NumberFormat("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits});decimals.set(digits,formatter);}
  const magnitude=formatter.format(Math.abs(value));
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${magnitude}`;
}

export function tone(value: number | null): string {
  return value === null || value === 0 ? "neutral" : value > 0 ? "up" : "down";
}

export function displayUpdate(timestamp: string, market: "CN" | "US") {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN",{ month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:market === "CN" ? "Asia/Shanghai" : "America/New_York" }).format(date) : "时间未知";
}
