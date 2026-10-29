import {
  BENCHMARKS,
  type DailyBar,
  type Instrument,
  type Market,
  type MarketSnapshot,
  type MarketState,
} from "../market-types";
import {
  buildCalendar,
  buildHistory,
  calculateSignals,
  marketDate,
  validateBars,
} from "../lib/market-signals";
import { loadSentiment } from "./sentiment-data";
import { SourceError, reportSourceFailure, isTransientSourceFailure } from "./source-errors";

type JsonObject = Record<string, any>;
export type FetchJson = (url: URL) => Promise<JsonObject>;
const memoryCache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const NUMBER = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);

async function fetchJson(url: URL): Promise<JsonObject> {
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
    const retryAfterMs = retryAfter === null ? 0 : /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
    throw new SourceError(`Market source returned ${response.status}`, url.hostname, "http", Date.now() - started, response.status, retryAfterMs);
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch (error) {
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
  const task = load()
    .then((value) => {
      // Bound memory even when many different search queries hit a warm worker.
      if (memoryCache.size >= 150)
        memoryCache.delete(memoryCache.keys().next().value!);
      memoryCache.set(key, { value, until: Date.now() + ttl });
      return value;
    })
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
  if (!Array.isArray(rows)) throw new Error("Invalid search response");
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
  );
}

export function parseYahoo(
  payload: JsonObject,
  symbol: string,
  now = Date.now(),
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
  );
}

function makeSnapshot(
  instrument: Instrument,
  bars: DailyBar[],
  trading: boolean,
  currency: string,
  source: MarketSnapshot["source"],
  now: number,
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
    days: buildCalendar(bars, marketDate(now, instrument.market), instrument.market),
    signals: calculateSignals(bars, trading),
    history: buildHistory(bars, marketDate(now, instrument.market), trading),
    source,
  };
}

export async function loadMarket(
  market: Market,
  symbol = BENCHMARKS[market].symbol,
  read: FetchJson = fetchJson,
  now = Date.now(),
): Promise<MarketSnapshot> {
  if (!validSymbol(market, symbol)) throw new Error("Invalid instrument");
  const readSnapshot = async () => {
    if (market === "CN") {
      const key = `${symbol.endsWith(".SS") ? "sh" : "sz"}${symbol.slice(0, 6)}`;
      const url = new URL("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get");
      url.searchParams.set("param", `${key},day,,,640,qfq`);
      return parseTencent(await read(url), symbol, now);
    }
    let lastError: unknown;
    for (const host of [
      "query1.finance.yahoo.com",
      "query2.finance.yahoo.com",
    ]) {
      const url = new URL(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`,
      );
      url.search = new URLSearchParams({
        range: "2y",
        interval: "1d",
      }).toString();
      try {
        return parseYahoo(await read(url), symbol, now);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
  const load = async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { return await readSnapshot(); }
      catch (error) {
        reportSourceFailure("market", market === "CN" ? "Tencent" : "Yahoo", error, { market, symbol, attempt });
        // One bounded retry for a quick transient CN transport failure. Never
        // retry access denials, throttling, malformed data or a full timeout.
        if (market === "CN" && attempt === 1 && isTransientSourceFailure(error) && error.elapsedMs < 2000) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw error;
      }
    }
    throw new Error("Market load did not complete");
  };
  return read === fetchJson
    ? cached(`market:${market}:${symbol}`, 60_000, async () => {
        const [snapshot, sentiment] = await Promise.all([
          load(),
          loadSentiment(market),
        ]);
        return { ...snapshot, sentiment };
      })
    : load();
}

export async function loadDashboard(): Promise<Record<Market, MarketState>> {
  const results = await Promise.allSettled([
    loadMarket("CN"),
    loadMarket("US"),
  ]);
  return Object.fromEntries(
    (["CN", "US"] as Market[]).map((market, index) => {
      const result = results[index];
      return [
        market,
        {
          instrument: BENCHMARKS[market],
          snapshot: result.status === "fulfilled" ? result.value : null,
          error: result.status === "fulfilled" ? null : "行情暂不可用",
          ...(result.status === "rejected" ? { retryable: isTransientSourceFailure(result.reason) } : {}),
        },
      ];
    }),
  ) as Record<Market, MarketState>;
}
