import type { MarketSnapshot, TechnicalValues } from "../market-types";
import { updateHistory, type HistoryState } from "./history-engine";
import { buildCalendar, calculateSignals, marketDate } from "./market-signals";
import { validCompactSnapshot } from "./snapshot-record";

const states = new Map<string, HistoryState>();
/** Expand bounded transport data in the browser or an explicit offline caller. */
export function expandSnapshot(snapshot: MarketSnapshot): MarketSnapshot {
  if (!snapshot.bars) return snapshot;
  const market = snapshot.instrument.market;
  if (!validCompactSnapshot(snapshot, market, snapshot.instrument.symbol, Date.now())) throw new Error("Invalid compact quote");
  const key = `${market}:${snapshot.instrument.symbol}`;
  const state = updateHistory(snapshot.bars, snapshot.session === "trading", states.get(key));
  if (states.size >= 6 && !states.has(key)) states.delete(states.keys().next().value!);
  states.set(key, state);
  const { bars, ...rest } = snapshot;
  const today = marketDate(Date.parse(snapshot.fetchedAt), market);
  const cutoff = new Date(Date.parse(snapshot.asOf) - 364 * 86400000).toISOString().slice(0, 10);
  const latest = state.rows.at(-1)!;
  // Reuse descriptors; their calculations see no bars. Values come from the incremental state.
  const signals = calculateSignals([], snapshot.session === "trading").map(signal => {
    const id = signal.id as keyof TechnicalValues;
    return { ...signal, value: latest.values[id], previous: latest.previous[id], unavailable: latest.values[id] === null ? signal.unavailable : null };
  });
  return { ...rest, days: buildCalendar(bars, today, market), signals,
    history: Object.fromEntries(bars.flatMap((bar, i) => bar.date >= cutoff ? [[bar.date, state.rows[i]]] : [])) };
}
