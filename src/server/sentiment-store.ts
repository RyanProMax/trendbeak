import type { Market, SentimentData } from "../market-types";
import { isDate, marketDate } from "../lib/market-signals";
import { DEFAULT_SENTIMENT_SOURCE, SENTIMENT_SOURCES, validSentimentSource, type SentimentSource } from "../lib/sentiment-sources";
import type { SnapshotEdgeCache } from "./snapshot-cache";

export const SENTIMENT_TTL_MS = 300_000;
export interface SentimentQuery { market: Market; source: SentimentSource; from: string; to: string }
export interface SentimentRow { market: Market; date: string; source: SentimentSource; score: number; updated_at: string }
export interface SentimentSnapshot { storedAt: string; rows: SentimentRow[] }

export function sentimentQuery(market: Market, source = DEFAULT_SENTIMENT_SOURCE[market], from?: string, to = marketDate(Date.now(), market)): SentimentQuery {
  from ??= new Date(Date.parse(to) - 740 * 86_400_000).toISOString().slice(0, 10);
  if (!validSentimentSource(market, source) || !isDate(from) || !isDate(to) || from > to || to > marketDate(Date.now(), market)) throw new Error("Invalid sentiment query");
  return { market, source, from, to };
}

/** Cache is disposable: a cold instance/edge miss always queries D1, never an upstream. */
export function createSentimentStore(clock = Date.now) {
  const memory = new WeakMap<D1Database, Map<string, SentimentSnapshot>>();
  const pending = new WeakMap<D1Database, Map<string, Promise<SentimentSnapshot>>>();
  return { async read(db: D1Database | undefined, query: SentimentQuery, origin = "https://trendbeak.com", edge?: SnapshotEdgeCache): Promise<SentimentSnapshot> {
    if (!db) throw new Error("Sentiment database binding unavailable");
    const { market, source, from, to } = query;
    if (!validSentimentSource(market, source) || !isDate(from) || !isDate(to) || from > to) throw new Error("Invalid sentiment query");
    const key = `${market}/${source}/${from}/${to}`;
    const saved = memory.get(db) ?? new Map<string, SentimentSnapshot>(); memory.set(db, saved);
    const requests = pending.get(db) ?? new Map<string, Promise<SentimentSnapshot>>(); pending.set(db, requests);
    const valid = (value: any): value is SentimentSnapshot => value && Number.isFinite(Date.parse(value.storedAt)) && clock() >= Date.parse(value.storedAt) && clock() - Date.parse(value.storedAt) < SENTIMENT_TTL_MS && Array.isArray(value.rows) && value.rows.every((r: SentimentRow, i: number, all: SentimentRow[]) => r.market === market && r.source === source && isDate(r.date) && r.date >= from && r.date <= to && (!i || all[i-1].date < r.date) && typeof r.score === "number" && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100 && Number.isFinite(Date.parse(r.updated_at)));
    const remember = (value: SentimentSnapshot) => { if (saved.size >= 32) saved.delete(saved.keys().next().value!); saved.set(key, value); return value; };
    const hit = saved.get(key); if (valid(hit)) return hit;
    if (requests.has(key)) return requests.get(key)!;
    const task = (async () => {
      // Keep preview/local origins isolated. New namespace prevents old relay cache reuse.
      const request = new Request(new URL(`/__sentiment-db/v1/${key}`, origin));
      try { const response = await edge?.match(request), cached = response?.ok ? await response.json() : null; if (valid(cached)) return remember(cached); }
      catch { /* Cache outages do not block D1. */ }
      const result = await db.prepare("SELECT market, date, source, score, updated_at FROM sentiment_daily WHERE market = ? AND source = ? AND date >= ? AND date <= ? ORDER BY date").bind(market, source, from, to).all<SentimentRow>();
      if (!result.success) throw new Error("Sentiment database read failed");
      const snapshot = { storedAt: new Date(clock()).toISOString(), rows: result.results };
      if (!valid(snapshot)) throw new Error("Invalid stored sentiment");
      remember(snapshot);
      try { await edge?.put(request, Response.json(snapshot, { headers: { "Cache-Control": `public, max-age=${SENTIMENT_TTL_MS / 1000}` } })); }
      catch { /* D1 remains the source of truth. */ }
      return snapshot;
    })().finally(() => requests.delete(key));
    requests.set(key, task); return task;
  } };
}

const store = createSentimentStore(() => Date.now());
export const readSentiment = store.read;
export async function loadSentiment(market: Market, db?: D1Database, origin?: string): Promise<SentimentData> {
  const source = SENTIMENT_SOURCES[DEFAULT_SENTIMENT_SOURCE[market]], metadata = { source: { name: source.name, url: source.url }, description: source.description };
  try {
    const edge = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: SnapshotEdgeCache }).default;
    const query = sentimentQuery(market), snapshot = await readSentiment(db, query, origin, edge);
    let reportedObservations: SentimentData["reportedObservations"];
    if (market === "US") try {
      const reports = await readSentiment(db, { ...query, source: "cnn_benzinga" }, origin, edge), source = SENTIMENT_SOURCES.cnn_benzinga;
      reportedObservations = reports.rows.map(r => ({ date: r.date, value: r.score, previous: null, source: { name: source.name, url: source.url } }));
    } catch { /* An optional report cannot disable the main series. */ }
    return { ...metadata, observations: snapshot.rows.map((r, i, all) => ({ date: r.date, value: r.score, previous: all[i-1]?.score ?? null, source: metadata.source })), ...(reportedObservations?.length ? { reportedObservations } : {}) };
  } catch { return { ...metadata, observations: [], error: "贪恐数据暂不可用。" }; }
}
