import type { SentimentData, SentimentObservation } from "../market-types";
import { isDate, marketDate } from "../lib/market-signals";

export const CNN_GRAPH_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
export const CNN_SOURCE = { name: "CNN 贪恐指数", url: "https://www.cnn.com/markets/fear-and-greed" };
const RELAY_URL = "https://fearandgreednow.com/about", DAY = 86400000;
const score = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
const stamp = (v: unknown) => typeof v === "string" ? Date.parse(v) : typeof v === "number" && Number.isFinite(v) ? v : NaN;
// Seven days of boundary slack match the existing last-good limit across holidays; visible windows stay capped at 365.
const cutoff = (now: number) => new Date(Date.parse(marketDate(now, "US")) - 371 * DAY).toISOString().slice(0, 10);
export interface CNNHistory extends SentimentData { emptyDates: string[]; fetchedAt: string }

/** UTC midnight x values label a daily date, not a New York instant.
 * Non-midnight/live timestamps represent instants; never assign undated comparisons to dates. */
export function parseCNNHistory(payload: unknown, now = Date.now(), provenance = CNN_SOURCE): CNNHistory {
  const raw = payload as { fear_and_greed_historical?: { data?: unknown }; fear_and_greed?: { score?: unknown; timestamp?: unknown } };
  const rows = raw?.fear_and_greed_historical?.data;
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error("Invalid CNN historical series");
  const today = marketDate(now, "US"), min = cutoff(now), points = new Map<string, SentimentObservation>(), empty = new Set<string>();
  const insert = (point: SentimentObservation) => {
    if (point.date < min || point.date > today) return;
    const old = points.get(point.date), a = Date.parse(point.observedAt!), b = old ? Date.parse(old.observedAt!) : -Infinity;
    if (a === b && old && old.value !== point.value) throw new Error("Conflicting CNN observation timestamp");
    if (!old || a > b) points.set(point.date, point);
  };
  for (const row of rows) {
    if (!row || typeof row.x !== "number" || !Number.isFinite(row.x) || row.x < 0 || row.x > now + 300000) throw new Error("Invalid CNN historical timestamp");
    const time = new Date(row.x), daily = row.x % DAY === 0, date = daily ? time.toISOString().slice(0, 10) : marketDate(row.x, "US");
    if (row.y === null) { if (date >= min && date <= today) empty.add(date); continue; }
    if (!score(row.y)) throw new Error("Invalid CNN historical score");
    insert({ date, value: row.y, previous: null, observedAt: time.toISOString(), dateKind: daily ? "utc-date" : "market-time", source: provenance });
  }
  const live = raw.fear_and_greed;
  if (live?.timestamp !== undefined || live?.score !== undefined) {
    const time = stamp(live.timestamp);
    if (!score(live.score) || !Number.isFinite(time) || time < 0 || time > now + 300000) throw new Error("Invalid CNN current observation");
    insert({ date: marketDate(time, "US"), value: live.score, previous: null, observedAt: new Date(time).toISOString(), dateKind: "market-time", source: provenance });
  }
  const observations = [...points.values()].sort((a, b) => a.date.localeCompare(b.date)).map((p, i, all) => ({ ...p, previous: all[i - 1]?.value ?? null }));
  if (!observations.length) throw new Error("No CNN history in requested year");
  return { source: provenance, description: "CNN 发布的美股市场情绪综合指数；历史日线按日期标签，实时观测按美东时间归日，缺失日期不补值。", observations,
    emptyDates: [...empty].filter(date => !points.has(date)), fetchedAt: new Date(now).toISOString() };
}

const trusted = (url: string | undefined) => url === CNN_SOURCE.url || url === RELAY_URL;
/** A new successful official snapshot may revise history. Relay live data never
 * overwrites an official historical date, and previous_close is never dated/backfilled. */
export function mergeKnownUSHistory(previous: SentimentData | undefined, current: SentimentData, now = Date.now(), admittedSources: readonly string[] = []): SentimentData {
  const accepted = (url: string | undefined) => trusted(url) || !!url && admittedSources.includes(url);
  if (!accepted(current.source.url)) throw new Error("Unapproved US sentiment source");
  const min = cutoff(now), today = marketDate(now, "US"), points = new Map<string, SentimentObservation>();
  if (accepted(previous?.source.url)) for (const p of previous!.observations) {
    if (isDate(p.date) && p.date >= min && p.date <= today && score(p.value) && (!current.error || p.date < today) && (!p.source || accepted(p.source.url))) points.set(p.date, p);
  }
  for (const date of (current as Partial<CNNHistory>).emptyDates ?? []) points.delete(date);
  for (const p of current.observations) {
    if (!isDate(p.date) || p.date < min || p.date > today || !score(p.value) || (p.source && !accepted(p.source.url))) throw new Error("Invalid US observation merge");
    const old = points.get(p.date), official = current.source.url === CNN_SOURCE.url || p.source?.url === CNN_SOURCE.url || admittedSources.includes(p.source?.url ?? "");
    if (!official && old?.source && (old.source.url === CNN_SOURCE.url || admittedSources.includes(old.source.url)) && p.date < today) continue;
    if (!official && old?.observedAt && p.observedAt && Date.parse(old.observedAt) > Date.parse(p.observedAt)) continue;
    points.set(p.date, p);
  }
  const observations = [...points.values()].sort((a,b)=>a.date.localeCompare(b.date)).map((p,i,all)=>({...p,previous:all[i-1]?.value??null}));
  return { ...current, observations, ...(observations.length > 1 ? { historyUnavailable: "仅展示已取得且有日期的真实情绪观测，历史缺日留空。" } : {}) };
}

async function limitedBody(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > 4000000) { await response.body?.cancel(); throw new Error("CNN history body too large"); }
  const reader = response.body?.getReader(); if (!reader) throw new Error("Empty CNN history response");
  const decoder = new TextDecoder(); let bytes = 0, body = "";
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength;
    if (bytes > 4000000) { await reader.cancel(); throw new Error("CNN history body too large"); }
    body += decoder.decode(chunk.value, { stream: true });
  } return body + decoder.decode(); } finally { reader.releaseLock(); }
}

/** Opt-in reader: not wired to the live site while normal access is denied.
 * No browser impersonation, Referer, credentials, proxy, retries or mirrors. */
export function createCNNHistoryReader(read: typeof fetch = fetch, clock = Date.now) {
  let saved: CNNHistory | undefined, blocked = false, until = 0, pending: Promise<{ data: SentimentData | null; error: string | null; blocked: boolean }> | undefined;
  let lastError: string | null = null;
  const result = () => ({ data: saved ? lastError ? { ...saved, error: lastError, observations: saved.observations.filter(p=>p.date<marketDate(clock(),"US")) } : saved : null, error: lastError, blocked });
  return { async get() {
    if (blocked || clock() < until) return result();
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await read(CNN_GRAPH_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
        if (!response.ok) { blocked = [401,403,418,429].includes(response.status); await response.body?.cancel(); throw new Error(`CNN history HTTP ${response.status}`); }
        const body = await limitedBody(response);
        const parsed = parseCNNHistory(JSON.parse(body), clock());
        saved = { ...parsed, ...mergeKnownUSHistory(saved, parsed, clock()) };
        lastError = null; until = clock() + 3600000;
      } catch (error) { lastError = error instanceof Error ? error.message : "CNN history unavailable"; until = clock() + 60000; }
      return result();
    })().finally(()=>{pending=undefined;});
    return pending;
  } };
}
