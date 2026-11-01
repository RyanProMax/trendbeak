import {
  BENCHMARKS,
  type DailyBar,
  type Instrument,
  type Market,
  type MarketSnapshot,
} from "../market-types";
import {
  buildCalendar,
  buildHistory,
  calculateSignals,
  marketDate,
  validateBars,
} from "../lib/market-signals";
import { loadSentiment, sentimentRevision, sentimentJSON } from "./sentiment-store";
import { SourceError, reportSourceFailure, isTransientSourceFailure } from "./source-errors";

import { readMarketSnapshot, SnapshotMissing } from "./market-snapshot-store";

type JsonObject = Record<string, any>;
export type FetchJson = (url: URL) => Promise<JsonObject>;
const memoryCache = new Map<string, { until: number; value: unknown }>();
const failures = new Map<string,{until:number;error:unknown}>();
const pending = new Map<string, Promise<unknown>>();
const NUMBER = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);

export async function fetchJson(url: URL): Promise<JsonObject> {
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 trendbeak/2.0" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new SourceError(timeout ? "Market source timed out" : "Market source network request failed", url.hostname, timeout ? "timeout" : "network", Date.now() - started);
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    // Any explicit Retry-After disables our quick recovery, even zero, expired or malformed values.
    const retryAfterMs = retryAfter === null ? 0 : Math.max(1, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now() || 0);
    throw new SourceError(`Market source returned ${response.status}`, url.hostname, "http", Date.now() - started, response.status, retryAfterMs);
  }
  let payload: unknown;
  try {
    const limit=512_000;
    if(Number(response.headers.get("Content-Length"))>limit){await response.body?.cancel();throw new SourceError("Market response exceeds byte budget",url.hostname,"shape",Date.now()-started,response.status);}
    const reader=response.body?.getReader(), decoder=new TextDecoder();let bytes=0,text="";
    if(!reader)throw new SyntaxError("Empty market response");
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw new SourceError("Market response exceeds byte budget",url.hostname,"shape",Date.now()-started,response.status);}text+=decoder.decode(value,{stream:true});}
    payload=JSON.parse(text+decoder.decode());
  }
  catch (error) {
    if(error instanceof SourceError)throw error;
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const syntax = error instanceof SyntaxError;
    throw new SourceError(timeout ? "Market source response body timed out" : syntax ? "Market source returned invalid JSON" : "Market source response body failed", url.hostname, timeout ? "timeout" : syntax ? "json" : "network", Date.now() - started, response.status);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new SourceError("Invalid market response", url.hostname, "shape", Date.now() - started, response.status);
  return payload as JsonObject;
}

async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const found = memoryCache.get(key);
  if (found && found.until > Date.now()) return found.value as T;
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const failure=failures.get(key);if(failure&&failure.until>Date.now())throw failure.error;
  if(pending.size>=8)throw new Error("Search request budget reached");
  const task = load()
    .then((value) => {
      // Bound memory even when many different search queries hit a warm worker.
      if (memoryCache.size >= 150)
        memoryCache.delete(memoryCache.keys().next().value!);
      memoryCache.set(key, { value, until: Date.now() + ttl });
      return value;
    })
    .catch(error=>{if(failures.size>=150)failures.delete(failures.keys().next().value!);failures.set(key,{until:Date.now()+60_000,error});throw error;})
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export function validSymbol(market: Market, symbol: string): boolean {
  return market === "CN"
    ? /^\d{6}\.(SS|SZ)$/.test(symbol)
    : symbol === "^GSPC" || /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol);
}

function cleanName(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 120 &&
    !/[<>\u0000-\u001f]/.test(value)
    ? value.trim()
    : null;
}

/** Symbol/exchange identity is taken from source records, never generated names. */
export function parseSearch(payload: JsonObject): Instrument[] {
  const rows = payload.QuotationCodeTable?.Data;
  if (!Array.isArray(rows) || rows.length>100) throw new Error("Invalid search response");
  const instruments = new Map<string, Instrument>();
  for (const row of rows) {
    const name = cleanName(row.Name),
      code = row.Code;
    if (!name || typeof code !== "string") continue;
    let market: Market, symbol: string;
    if (
      row.Classify === "AStock" &&
      /^\d{6}$/.test(code) &&
      ["0", "1"].includes(String(row.MktNum))
    ) {
      market = "CN";
      symbol = `${code}.${String(row.MktNum) === "1" ? "SS" : "SZ"}`;
    } else if (
      row.Classify === "UsStock" &&
      ["105", "106", "107"].includes(String(row.MktNum)) &&
      /^[A-Z][A-Z0-9.-]{0,14}$/.test(code)
    ) {
      market = "US";
      symbol = code.replaceAll(".", "-");
    } else continue;
    instruments.set(`${market}:${symbol}`, {
      market,
      symbol,
      code,
      name,
      kind: "stock",
    });
  }
  return [...instruments.values()].slice(0, 10);
}

export async function searchInstruments(
  query: string,
  read: FetchJson = fetchJson,
): Promise<Instrument[]> {
  const text = query.trim();
  if (!text || text.length > 60 || /[\u0000-\u001f]/.test(text)) return [];
  const load = async () => {
    const url = new URL("https://searchapi.eastmoney.com/api/suggest/get");
    url.search = new URLSearchParams({
      input: text,
      type: "14",
      count: "15",
    }).toString();
    try { return parseSearch(await read(url)); }
    catch (error) { reportSourceFailure("search", url.hostname, error); throw error; }
  };
  return read === fetchJson
    ? cached(`search:${text.toLowerCase()}`, 300_000, load)
    : load();
}

export function parseTencent(
  payload: JsonObject,
  symbol: string,
  now = Date.now(),
  compact = false,
): MarketSnapshot {
  if (!validSymbol("CN", symbol)) throw new Error("Invalid CN symbol");
  const key = `${symbol.endsWith(".SS") ? "sh" : "sz"}${symbol.slice(0, 6)}`;
  const record = payload.data?.[key];
  const quote = record?.qt?.[key];
  const rows = record?.qfqday ?? record?.day;
  if (
    payload.code !== 0 ||
    !Array.isArray(rows) ||
    !Array.isArray(quote) ||
    quote[2] !== symbol.slice(0, 6) ||
    !cleanName(quote[1])
  )
    throw new Error("CN identity mismatch");
  if (rows.length > 640) throw new Error("Daily bar budget exceeded");
  const bars = validateBars(
    rows.map((row: unknown[]) => ({
      date: row[0],
      open: Number(row[1]),
      close: Number(row[2]),
      high: Number(row[3]),
      low: Number(row[4]),
      volume: row[5] == null ? null : Number(row[5]),
    })) as DailyBar[],
    marketDate(now, "CN"),
  );
  if (!bars.length) throw new Error("No daily bars");
  const last = bars.at(-1)!;
  const quoteTime = String(quote[30] ?? "");
  const quoteDate = /^\d{14}$/.test(quoteTime)
    ? `${quoteTime.slice(0, 4)}-${quoteTime.slice(4, 6)}-${quoteTime.slice(6, 8)}`
    : null;
  if (quoteDate && quoteDate > last.date)
    throw new Error("Latest CN daily bar is missing");
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(now));
  const trading =
    last.date === marketDate(now, "CN") && time >= "09:30" && time < "15:00";
  const instrument =
    symbol === BENCHMARKS.CN.symbol
      ? BENCHMARKS.CN
      : {
          symbol,
          code: symbol.slice(0, 6),
          name: cleanName(quote[1])!,
          market: "CN" as const,
          kind: "stock" as const,
        };
  return makeSnapshot(
    instrument,
    bars,
    trading,
    "CNY",
    { name: "腾讯证券", url: `https://gu.qq.com/${key}` },
    now,
    compact,
  );
}

export function parseYahoo(
  payload: JsonObject,
  symbol: string,
  now = Date.now(),
  compact = false,
): MarketSnapshot {
  const record = payload.chart?.result?.[0];
  const meta = record?.meta;
  if (
    payload.chart?.error ||
    !record ||
    meta?.symbol !== symbol ||
    !["America/New_York", "US/Eastern"].includes(meta.exchangeTimezoneName)
  )
    throw new Error("US identity mismatch");
  const quote = record.indicators?.quote?.[0];
  if (!Array.isArray(record.timestamp) || !quote)
    throw new Error("Missing US daily bars");
  if(record.timestamp.length > 640) throw new Error("Daily bar budget exceeded");
  const input: DailyBar[] = [];
  for (let index = 0; index < record.timestamp.length; index++) {
    if (!NUMBER(record.timestamp[index]))
      throw new Error("Invalid bar timestamp");
    const prices = [
      quote.open?.[index],
      quote.high?.[index],
      quote.low?.[index],
      quote.close?.[index],
    ];
    if (prices.every((value) => value === null || value === undefined))
      throw new Error("Missing US daily bar");
    if (!prices.every(NUMBER)) throw new Error("Incomplete US OHLC bar");
    input.push({
      date: marketDate(record.timestamp[index] * 1000, "US"),
      open: prices[0],
      high: prices[1],
      low: prices[2],
      close: prices[3],
      volume: NUMBER(quote.volume?.[index]) ? quote.volume[index] : null,
    });
  }
  const bars = validateBars(input, marketDate(now, "US"));
  if (!bars.length) throw new Error("No daily bars");
  const regular = meta.currentTradingPeriod?.regular;
  const trading =
    bars.at(-1)!.date === marketDate(now, "US") &&
    NUMBER(regular?.start) &&
    NUMBER(regular?.end) &&
    now >= regular.start * 1000 &&
    now < regular.end * 1000;
  const name = cleanName(meta.longName) ?? cleanName(meta.shortName) ?? symbol;
  const instrument =
    symbol === BENCHMARKS.US.symbol
      ? BENCHMARKS.US
      : {
          market: "US" as const,
          symbol,
          code: symbol,
          name,
          kind: "stock" as const,
        };
  return makeSnapshot(
    instrument,
    bars,
    trading,
    typeof meta.currency === "string" ? meta.currency : "USD",
    {
      name: "Yahoo Finance",
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,
    },
    now,
    compact,
  );
}

function makeSnapshot(
  instrument: Instrument,
  bars: DailyBar[],
  trading: boolean,
  currency: string,
  source: MarketSnapshot["source"],
  now: number,
  compact = false,
): MarketSnapshot {
  const last = bars.at(-1)!,
    previous = bars.at(-2);
  return {
    instrument,
    asOf: last.date,
    fetchedAt: new Date(now).toISOString(),
    session: trading ? "trading" : "closed",
    price: last.close,
    change: previous ? (last.close / previous.close - 1) * 100 : null,
    currency,
    ...(compact ? { bars } : {}),
    days: compact ? [] : buildCalendar(bars, marketDate(now, instrument.market), instrument.market),
    signals: compact ? [] : calculateSignals(bars, trading),
    history: compact ? {} : buildHistory(bars, marketDate(now, instrument.market), trading),
    source,
  };
}

/** HTTP readers only read existing durable views; never initialize or update quotes. */
export async function loadMarket(market:Market,symbol=BENCHMARKS[market].symbol,db?:D1Database,origin="https://trendbeak.com"){
  if(!validSymbol(market,symbol))throw Error("Invalid instrument");
  const record=await readMarketSnapshot(db,market,symbol,origin);
  const end=await marketWindowEnd(db)??record.asOf,sentiment=await loadSentiment(market,db,origin,end);
  const body=`{"data":${record.payload.slice(0,-1)},"freshness":${JSON.stringify(record.freshness)},"sentiment":${sentimentJSON(sentiment)}}}`;
  return {body,revision:`${record.updatedAt}:${sentimentRevision(sentiment)}:${end}`};
}
export { SnapshotMissing };
export async function loadHealth(origin:string,db?:D1Database){
  const empty=Object.fromEntries((["CN","US"] as Market[]).map(m=>[m,{available:false,asOf:null,freshness:null}]));if(!db)return {status:"degraded",markets:empty};
  try{const r=await db.prepare("SELECT key, json_extract(payload, '$.view.asOf') AS asOf, json_extract(payload, '$.view.fetchedAt') AS fetchedAt FROM market_snapshot WHERE key IN (?, ?)").bind('CN/000300.SS','US/^GSPC').all<{key:string;asOf:string;fetchedAt:string}>();if(!r.success)throw Error('Health read failed');
    const markets=Object.fromEntries((["CN","US"] as Market[]).map(m=>{const row=r.results.find(r=>r.key===`${m}/${BENCHMARKS[m].symbol}`),age=row?Math.max(0,Date.now()-Date.parse(row.fetchedAt)):Infinity;return [m,row?{available:true,asOf:row.asOf,freshness:{state:age<300000?'fresh':'stale',storedAt:row.fetchedAt,ageSeconds:Math.floor(age/1000),freshTtlSeconds:300,maxAgeSeconds:604800,via:'database'}}:empty[m]];}));return {status:Object.values(markets).every((s:any)=>s.available&&s.freshness.state==='fresh')?'ok':'degraded',markets};
  }catch{return {status:'degraded',markets:empty};}
}
export async function markPrepared(instruments:Instrument[],db?:D1Database):Promise<Instrument[]>{if(!db||!instruments.length)return instruments;try{const keys=instruments.map(i=>`${i.market}/${i.symbol}`),r=await db.prepare(`SELECT key FROM market_snapshot WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all<{key:string}>();if(!r.success)return instruments;const ready=new Set(r.results.map(r=>r.key));return instruments.map(i=>({...i,prepared:ready.has(`${i.market}/${i.symbol}`)}));}catch{return instruments;}}

const ends=new WeakMap<D1Database,{until:number;value?:string;pending?:Promise<string|undefined>}>();
async function marketWindowEnd(db?:D1Database):Promise<string|undefined>{if(!db)return;const hit=ends.get(db);if(hit?.pending)return hit.pending;if(hit&&hit.until>Date.now())return hit.value;const task=(async()=>{try{const r=await db.prepare("SELECT MAX(json_extract(payload, '$.view.asOf')) AS latest FROM market_snapshot WHERE key IN (?, ?)").bind('CN/000300.SS','US/^GSPC').all<{latest:string}>();return r.results[0]?.latest;}catch{return undefined;}})();ends.set(db,{until:0,pending:task});const value=await task;ends.set(db,{until:Date.now()+300000,value});return value;}
