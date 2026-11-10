import {usETFCurrentRoute} from './server/us-etf-current-dated-response';
import {usETFValuationResponse} from './server/us-etf-valuation-response';
import {valuationResponse} from './server/valuation-response';
import {usThemeValuationResponse} from './server/us-theme-valuation-response';
import{marketResponse}from"./server/market-response";
import { Hono } from "hono";
import {LinearRouter} from "hono/router/linear-router";
import { shell } from "./server/shell";
import { readSentiment, sentimentQuery } from "./server/sentiment-store";
import { DEFAULT_SENTIMENT_SOURCE, SENTIMENT_SOURCES, validSentimentSource } from "./lib/sentiment-sources";
import type { SnapshotEdgeCache } from "./server/snapshot-cache";
import {
  loadHealth,
  markPrepared,
  searchInstruments,
} from "./server/market-data";

const app = new Hono<{ Bindings: { SENTIMENT_DB?: D1Database } }>({router:new LinearRouter()});
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

app.get("/api/valuations/US/current-estimate",c=>usETFCurrentRoute(new URL(c.req.url),c.env?.SENTIMENT_DB));
app.get("/api/valuations/US",c=>usETFValuationResponse(new URL(c.req.url),c.env?.SENTIMENT_DB));
app.get("/api/valuations/US/themes",c=>usThemeValuationResponse(new URL(c.req.url),c.env?.SENTIMENT_DB));
app.get("/api/valuations/CN",c=>valuationResponse(new URL(c.req.url),c.env?.SENTIMENT_DB));

app.get("/api/markets", (c) => { c.header("Cache-Control","no-store");return c.json({error:"请按市场读取行情",markets:["/api/markets/CN","/api/markets/US"]},410); });
app.get("/api/markets/:market",c=>marketResponse(c.req.raw,c.env?.SENTIMENT_DB,new URL(c.req.url)));
app.get("/api/search", async (c) => {
  const query = c.req.query("q")?.trim() ?? "";
  if (query.length > 60 || /[\u0000-\u001f]/.test(query))
    return c.json({ error: "搜索词无效" }, 400);
  try {
    const instruments = await markPrepared(await searchInstruments(query,undefined,c.env?.SENTIMENT_DB),c.env?.SENTIMENT_DB);
    c.header("Cache-Control", "public, max-age=60, s-maxage=300");
    return c.json({ data: instruments });
  } catch (error) {
    console.error("Instrument search failed", error instanceof Error ? error.message : String(error));
    c.header("Cache-Control", "no-store");
    return c.json({ error: "搜索暂不可用" }, 503);
  }
});
app.get("/api/health", async (c) => {
  const data=await loadHealth(new URL(c.req.url).origin,c.env?.SENTIMENT_DB);
  c.header("Cache-Control","no-store");
  return c.json({data},data.status==='ok'?200:503);
});

app.get("/", async (c) => {
  // Built once without live data; no React render or date calculation on reads.
  return new Response(shell, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-cache",
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
const dispatch=app.fetch;
app.fetch=(request,env,context)=>{
 if(request.method==='GET'&&request.url.includes('/api/markets/')){const url=new URL(request.url);if(/^\/api\/markets\/[^/]+$/.test(url.pathname))return marketResponse(request,(env as {SENTIMENT_DB?:D1Database}|undefined)?.SENTIMENT_DB,url);}
 return dispatch(request,env,context);
};
export default app;
