import {readerDate} from "./market-clock";
import type { Market, SentimentData } from "../market-types";
import { isDate } from "../lib/market-signals";
import { DEFAULT_SENTIMENT_SOURCE, SENTIMENT_SOURCES, validSentimentSource, type SentimentSource } from "../lib/sentiment-sources";
import type { SnapshotEdgeCache } from "./snapshot-cache";

export const SENTIMENT_TTL_MS = 300_000;
export interface SentimentQuery { market: Market; source: SentimentSource; from: string; to: string }
export interface SentimentRow { market: Market; date: string; source: SentimentSource; score: number; updated_at: string }
export interface SentimentSnapshot { storedAt: string; rows: SentimentRow[] }

export function sentimentQuery(market: Market, source = DEFAULT_SENTIMENT_SOURCE[market], from?: string, to = readerDate(Date.now(), market)): SentimentQuery {
  from ??= new Date(Date.parse(to) - 364 * 86_400_000).toISOString().slice(0, 10);
  if (!validSentimentSource(market, source) || !isDate(from) || !isDate(to) || from > to || Date.parse(to)-Date.parse(from)>365*86_400_000 || to > readerDate(Date.now(), market)) throw new Error("Invalid sentiment query");
  return { market, source, from, to };
}

/** Cache is disposable: a cold instance/edge miss always queries D1, never an upstream. */
export function createSentimentStore(clock = Date.now) {
  const memory = new WeakMap<D1Database, Map<string, SentimentSnapshot>>();
  const failed = new WeakMap<D1Database,Map<string,{until:number;error:unknown}>>();
  const pending = new WeakMap<D1Database, Map<string, Promise<SentimentSnapshot>>>();
  return { async read(db: D1Database | undefined, query: SentimentQuery, origin = "https://trendbeak.com", edge?: SnapshotEdgeCache): Promise<SentimentSnapshot> {
    if (!db) throw new Error("Sentiment database binding unavailable");
    const { market, source, from, to } = query;
    if (!validSentimentSource(market, source) || !isDate(from) || !isDate(to) || from > to || Date.parse(to)-Date.parse(from)>371*86_400_000) throw new Error("Invalid sentiment query");
    const key = `${market}/${source}/${from}/${to}`;
    const saved = memory.get(db) ?? new Map<string, SentimentSnapshot>(); memory.set(db, saved);
    const errors=failed.get(db)??new Map<string,{until:number;error:unknown}>();failed.set(db,errors);
    const requests = pending.get(db) ?? new Map<string, Promise<SentimentSnapshot>>(); pending.set(db, requests);
    const valid = (value: any, maxAge=SENTIMENT_TTL_MS): value is SentimentSnapshot => value && Number.isFinite(Date.parse(value.storedAt)) && clock() >= Date.parse(value.storedAt) && clock() - Date.parse(value.storedAt) < maxAge && Array.isArray(value.rows) && value.rows.length<=372 && value.rows.every((r: SentimentRow, i: number, all: SentimentRow[]) => r.market === market && r.source === source && isDate(r.date) && r.date >= from && r.date <= to && (!i || all[i-1].date < r.date) && typeof r.score === "number" && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100 && Number.isFinite(Date.parse(r.updated_at)));
    const remember = (value: SentimentSnapshot) => { value.rows.forEach(Object.freeze);Object.freeze(value.rows);Object.freeze(value); if (saved.size >= 32) saved.delete(saved.keys().next().value!); saved.set(key, value); return value; };
    const hit = saved.get(key); if (hit && clock()>=Date.parse(hit.storedAt) && clock()-Date.parse(hit.storedAt)<SENTIMENT_TTL_MS) return hit;
    const failure=errors.get(key);if(failure&&failure.until>clock()){if(hit&&clock()>=Date.parse(hit.storedAt)&&clock()-Date.parse(hit.storedAt)<7*86400000)return hit;throw failure.error;}
    if (requests.has(key)) return requests.get(key)!;
    if(requests.size>=8)throw new Error("Sentiment request budget reached");
    const task = (async () => {
      // Keep preview/local origins isolated. New namespace prevents old relay cache reuse.
      const request = new Request(new URL(`/__sentiment-db/v2/${key}`, ["https://trendbeak.com","https://trendbeak.pages.dev"].includes(origin)?"https://trendbeak.com":origin));
      try { const response = await edge?.match(request), cached = response?.ok ? await response.json() : null; if(valid(cached,7*86400000)){remember(cached);if(clock()-Date.parse(cached.storedAt)<SENTIMENT_TTL_MS)return cached;} }
      catch { /* Cache outages do not block D1. */ }
      const result = await db.prepare("SELECT market, date, source, score, updated_at FROM sentiment_daily WHERE market = ? AND source = ? AND date >= ? AND date <= ? ORDER BY date LIMIT 373").bind(market, source, from, to).all<SentimentRow>();
      if (!result.success) throw new Error("Sentiment database read failed");
      const snapshot = { storedAt: new Date(clock()).toISOString(), rows: result.results };
      if (!valid(snapshot)) throw new Error("Invalid stored sentiment");
      remember(snapshot);errors.delete(key);
      try { await edge?.put(request, Response.json(snapshot, { headers: { "Cache-Control": `public, max-age=${7*86400}` } })); }
      catch { /* D1 remains the source of truth. */ }
      return snapshot;
    })().catch(error=>{if(errors.size>=32)errors.delete(errors.keys().next().value!);errors.set(key,{until:clock()+60_000,error});const fallback=saved.get(key);if(fallback&&clock()>=Date.parse(fallback.storedAt)&&clock()-Date.parse(fallback.storedAt)<7*86400000)return fallback;throw error;}).finally(() => requests.delete(key));
    requests.set(key, task); return task;
  } };
}

const store = createSentimentStore(() => Date.now());
export const readSentiment = store.read;
const projections=new WeakMap<SentimentSnapshot,{reports?:SentimentSnapshot;data:SentimentData}>();
const revisions=new WeakMap<SentimentData,string>();
const encoded=new WeakMap<SentimentData,string>();
export function sentimentJSON(data:SentimentData){let json=encoded.get(data);if(!json){json=JSON.stringify(data);encoded.set(data,json);}return json;}
export const sentimentRevision=(data:SentimentData)=>revisions.get(data)??"unavailable";
export async function loadSentiment(market: Market, db?: D1Database, origin?: string, through?:string): Promise<SentimentData> {
  const source = SENTIMENT_SOURCES[DEFAULT_SENTIMENT_SOURCE[market]], metadata = { source: { name: source.name, url: source.url }, description: source.description };
  try {
    const edge = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: SnapshotEdgeCache }).default;
    const current=sentimentQuery(market,undefined,undefined,through);
    // A seven-day quote fallback must not clip the annual sentiment window, nor
    // should a quote lag suppress newer, independently dated observations.
    const query={...current,from:new Date(Date.parse(current.to)-371*86400000).toISOString().slice(0,10)}, snapshot = await readSentiment(db, query, origin, edge);
    let reports:SentimentSnapshot|undefined;
    if(market==='US')try{reports=await readSentiment(db,{...query,source:'cnn_benzinga'},origin,edge);}catch{/* Optional evidence must not disable the primary series. */}
    const cached=projections.get(snapshot);if(cached&&cached.reports===reports)return cached.data;
    const reportSource=SENTIMENT_SOURCES.cnn_benzinga;
    const reportedObservations=reports?.rows.map(r=>({date:r.date,value:r.score,previous:null,source:{name:reportSource.name,url:reportSource.url}}));
    const data={...metadata,observations:snapshot.rows.map((r,i,all)=>({date:r.date,value:r.score,previous:all[i-1]?.score??null})),...(reportedObservations?.length?{reportedObservations}:{})};
    const revision=[...snapshot.rows,...(reports?.rows??[])].reduce((max,r)=>r.updated_at>max?r.updated_at:max,'')||'empty';
    revisions.set(data,revision+(market==='US'&&!reports?':report-unavailable':''));projections.set(snapshot,{reports,data});return data;
  } catch { return { ...metadata, observations: [], error: "贪恐数据暂不可用。" }; }
}
