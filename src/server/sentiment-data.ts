import type { Market, SentimentData } from "../market-types";
import { isDate, marketDate } from "../lib/market-signals";

const sources: Record<Market, Pick<SentimentData, "source" | "description">> = {
  CN: {
    source: {
      name: "百分位·自编指数",
      url: "https://baifenwei.com/indicator/fear-greed/",
    },
    description:
      "百分位发布的 A 股自编情绪指数，由波动、换手、融资融券、市场宽度、RSI 和涨跌停等维度汇总。反映整体 A 股情绪，非个股评分；与 CNN 的口径不同。",
  },
  US: {
    source: {
      name: "Fear & Greed·转引 CNN",
      url: "https://fearandgreednow.com/about",
    },
    description:
      "CNN 的美股市场情绪指数，综合动量、市场宽度、波动、期权等七项指标。通过 Fear & Greed 网站转引，非 CNN 直连；反映整体美股情绪，非个股评分。",
  },
};
const validScore = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100;

export function parseChinaSentiment(
  csv: string,
  now = Date.now(),
): SentimentData {
  const [header, ...lines] = csv
    .trim()
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  if (header !== "date,fear_greed_index")
    throw new Error("Unknown sentiment columns");
  const today = marketDate(now, "CN"),
    seen = new Set<string>();
  const rows = lines
    .map((line) => {
      const [date, raw, extra] = line.split(",");
      const value = Number(raw);
      if (
        !isDate(date) ||
        date > today ||
        seen.has(date) ||
        !raw?.trim() ||
        extra !== undefined ||
        !validScore(value)
      )
        throw new Error("Invalid sentiment observation");
      seen.add(date);
      return { date, value };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) throw new Error("No sentiment observations");
  const cutoff = new Date(Date.parse(today) - 740 * 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    ...sources.CN,
    observations: rows
      .map((row, i) => ({ ...row, previous: rows[i - 1]?.value ?? null }))
      .filter((row) => row.date >= cutoff),
  };
}

export function parseUSSentiment(
  payload: unknown,
  now = Date.now(),
): SentimentData {
  // The relay exposes dated current stock data, not a dated historical series.
  // Never assign its undated week/month comparisons to calendar cells.
  const data = payload as {
    stocks?: {
      error?: unknown;
      reading?: {
        value?: unknown;
        updatedAt?: unknown;
        stale?: unknown;
        history?: { yesterday?: unknown };
      };
    };
  };
  const reading = data?.stocks?.reading;
  const time =
    typeof reading?.updatedAt === "string"
      ? Date.parse(reading.updatedAt)
      : NaN;
  if (
    data?.stocks?.error ||
    !reading ||
    !validScore(reading.value) ||
    !Number.isFinite(time) ||
    time > now + 300000 ||
    reading.stale !== false
  )
    throw new Error("Unavailable sentiment reading");
  return {
    ...sources.US,
    historyUnavailable: "当前来源只提供有日期的当前观测，未提供逐日情绪历史。未标日期的周、月比较不作为历史曲线。",
    observations: [
      {
        date: marketDate(time, "US"),
        value: reading.value,
        previous: validScore(reading.history?.yesterday)
          ? reading.history.yesterday
          : null,
      },
    ],
  };
}

/** A failed refresh may retain validated past observations, never yesterday's
 * score relabelled as today or an old intraday value presented as current. */
export function sentimentFailure(market:Market,previous:SentimentData|undefined,now=Date.now()):SentimentData {
  const today=marketDate(now,market),cutoff=new Date(Date.parse(today)-364*86400000).toISOString().slice(0,10);
  return {...sources[market],...(previous?.historyUnavailable?{historyUnavailable:previous.historyUnavailable}:{}),
    observations:previous?.source.url===sources[market].source.url?previous.observations.filter(point=>isDate(point.date)&&point.date>=cutoff&&point.date<today&&validScore(point.value)):[],
    error:"贪恐数据暂不可用。"};
}

const cache = new Map<Market, { until: number; value: SentimentData }>();
const pending = new Map<Market, Promise<SentimentData>>();
export async function loadSentiment(market: Market): Promise<SentimentData> {
  const saved = cache.get(market);
  if (saved && saved.until > Date.now()) return saved.value;
  if (pending.has(market)) return pending.get(market)!;
  const task = (async () => {
    let value: SentimentData;
    try {
      const url =
        market === "CN"
          ? "https://baifenwei.com/data/fear-greed/fear-greed-full.csv"
          : "https://fearandgreednow.com/api/sentiment";
      const response = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        headers: { Accept: market === "CN" ? "text/csv" : "application/json" },
      });
      if (!response.ok) throw new Error("Sentiment unavailable");
      const text = await response.text();
      if (text.length > 1000000)
        throw new Error("Sentiment response too large");
      value =
        market === "CN"
          ? parseChinaSentiment(text)
          : parseUSSentiment(JSON.parse(text));
    } catch {
      value = sentimentFailure(market,saved?.value);
    }
    cache.set(market, {
      until:
        Date.now() + (value.error ? 60000 : market === "CN" ? 3600000 : 300000),
      value,
    });
    return value;
  })().finally(() => pending.delete(market));
  pending.set(market, task);
  return task;
}
