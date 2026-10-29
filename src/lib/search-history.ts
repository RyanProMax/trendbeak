import type { Instrument } from "../market-types";

export const HISTORY_KEY = "trendbeak:search-history:v1";
// Read only for migration of existing browser history.
export const LEGACY_HISTORY_KEY = "stock-daily:search-history:v2";
export function parseHistory(value: string | null): Instrument[] {
  try {
    const input: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    return input
      .filter((item): item is Instrument => {
        if (
          !item ||
          typeof item !== "object" ||
          item.kind !== "stock" ||
          !["CN", "US"].includes(item.market) ||
          typeof item.name !== "string" ||
          !item.name.trim() ||
          item.name.length > 120 ||
          typeof item.symbol !== "string" ||
          typeof item.code !== "string" ||
          item.code.length > 20
        )
          return false;
        const valid =
          item.market === "CN"
            ? /^\d{6}\.(SS|SZ)$/.test(item.symbol)
            : /^[A-Z][A-Z0-9.-]{0,14}$/.test(item.symbol);
        const key = `${item.market}:${item.symbol}`;
        if (!valid || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function remember(
  history: Instrument[],
  instrument: Instrument,
): Instrument[] {
  return [
    instrument,
    ...history.filter(
      (item) =>
        item.symbol !== instrument.symbol || item.market !== instrument.market,
    ),
  ].slice(0, 10);
}
