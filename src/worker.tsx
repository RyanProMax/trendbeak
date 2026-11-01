import { Hono } from "hono";
import { renderToReadableStream } from "react-dom/server.edge";
import Document from "./App";
import { isTransientSourceFailure } from "./server/source-errors";
import { BENCHMARKS, type Market } from "./market-types";
import { readSentiment, sentimentQuery } from "./server/sentiment-store";
import { DEFAULT_SENTIMENT_SOURCE, SENTIMENT_SOURCES, validSentimentSource } from "./lib/sentiment-sources";
import type { SnapshotEdgeCache } from "./server/snapshot-cache";
import {
  loadDashboard,
  loadMarket,
  searchInstruments,
  validSymbol,
} from "./server/market-data";

const app = new Hono<{ Bindings: { SENTIMENT_DB?: D1Database } }>();
const productionOrigin = "https://trendbeak.com";

app.get("/api/sentiment/:market", async (c) => {
  const market = c.req.param("market");
  if (market !== "CN" && market !== "US") return c.json({ error: "不支持的市场" }, 400);
  const source = c.req.query("source") ?? DEFAULT_SENTIMENT_SOURCE[market];
  if (!validSentimentSource(market, source)) return c.json({ error: "数据来源无效" }, 400);
  let query;
  try { query = sentimentQuery(market, source, c.req.query("from"), c.req.query("to")); }
  catch { return c.json({ error: "日期范围无效" }, 400); }
  try {
    const edge = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: SnapshotEdgeCache }).default;
    const snapshot = await readSentiment(c.env?.SENTIMENT_DB, query, new URL(c.req.url).origin, edge);
    c.header("Cache-Control", "no-cache");
    return c.json({ data: { ...query, sourceInfo: SENTIMENT_SOURCES[source], ...snapshot } });
  } catch {
    c.header("Cache-Control", "no-store");
    return c.json({ error: "贪恐数据暂不可用" }, 503);
  }
});

app.get("/api/markets", async (c) => {
  const markets = await loadDashboard(new URL(c.req.url).origin, c.env?.SENTIMENT_DB);
  c.header("Cache-Control", markets.CN.snapshot && markets.US.snapshot ? "no-cache" : "no-store");
  return c.json({ data: markets });
});
app.get("/api/markets/:market", async (c) => {
  const market = c.req.param("market");
  if (market !== "CN" && market !== "US")
    return c.json({ error: "不支持的市场" }, 400);
  const symbol = c.req.query("symbol") ?? BENCHMARKS[market].symbol;
  if (!validSymbol(market, symbol))
    return c.json({ error: "股票代码无效" }, 400);
  try {
    const snapshot = await loadMarket(market, symbol, undefined, undefined, new URL(c.req.url).origin, c.env?.SENTIMENT_DB);
    c.header("Cache-Control", "no-cache");
    return c.json({ data: snapshot });
  } catch (error) {
    c.header("Cache-Control", "no-store");
    return c.json({ error: "行情暂不可用", retryable: isTransientSourceFailure(error) }, 503);
  }
});
app.get("/api/search", async (c) => {
  const query = c.req.query("q")?.trim() ?? "";
  if (query.length > 60 || /[\u0000-\u001f]/.test(query))
    return c.json({ error: "搜索词无效" }, 400);
  try {
    const instruments = await searchInstruments(query);
    c.header("Cache-Control", "public, max-age=60, s-maxage=300");
    return c.json({ data: instruments });
  } catch {
    c.header("Cache-Control", "no-store");
    return c.json({ error: "搜索暂不可用" }, 503);
  }
});
app.get("/api/health", async (c) => {
  const markets = await loadDashboard(new URL(c.req.url).origin, c.env?.SENTIMENT_DB);
  const availability = Object.fromEntries(
    (["CN", "US"] as Market[]).map((market) => [
      market,
      {
        available: !!markets[market].snapshot,
        asOf: markets[market].snapshot?.asOf ?? null,
        freshness: markets[market].snapshot?.freshness ?? null,
      },
    ]),
  );
  const healthy = !!markets.CN.snapshot && !!markets.US.snapshot && markets.CN.snapshot.freshness?.state !== "stale" && markets.US.snapshot.freshness?.state !== "stale";
  c.header("Cache-Control", "no-store");
  return c.json(
    { data: { status: healthy ? "ok" : "degraded", markets: availability } },
    healthy ? 200 : 503,
  );
});

app.get("/", async (c) => {
  const markets = await loadDashboard(new URL(c.req.url).origin, c.env?.SENTIMENT_DB);
  const stream = await renderToReadableStream(
    <Document data={{ markets, requestUrl: `${productionOrigin}/` }} />,
  );
  return new Response(stream, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": markets.CN.snapshot && markets.US.snapshot ? "no-cache" : "no-store",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
});
app.onError((error, c) => {
  console.error("Request failed", error);
  c.header("Cache-Control", "no-store");
  return c.json({ error: "暂时无法读取数据" }, 503);
});
app.notFound((c) => c.json({ error: "未找到页面" }, 404));
export default app;
