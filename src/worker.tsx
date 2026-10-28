import { Hono } from "hono";
import { renderToReadableStream } from "react-dom/server.edge";
import Document from "./App";
import { BENCHMARKS, type Market } from "./market-types";
import {
  loadDashboard,
  loadMarket,
  searchInstruments,
  validSymbol,
} from "./server/market-data";
import { readApiReport, reportWriteRoutes } from "./server/report-writes";
import { getDailyArchive } from "./server/reports";

type Bindings = {
  DB?: D1Database;
  REMOTE_DATA_ORIGIN?: string;
  REPORT_WRITE_TOKENS?: string;
};
const app = new Hono<{ Bindings: Bindings }>();
const productionOrigin = "https://stock-daily-8k4.pages.dev";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

app.get("/api/markets", async (c) => {
  c.header("Cache-Control", "public, max-age=15, s-maxage=60");
  return c.json({ data: await loadDashboard() });
});
app.get("/api/markets/:market", async (c) => {
  const market = c.req.param("market");
  if (market !== "CN" && market !== "US")
    return c.json({ error: "不支持的市场" }, 400);
  const symbol = c.req.query("symbol") ?? BENCHMARKS[market].symbol;
  if (!validSymbol(market, symbol))
    return c.json({ error: "股票代码无效" }, 400);
  try {
    const snapshot = await loadMarket(market, symbol);
    c.header("Cache-Control", "public, max-age=15, s-maxage=60");
    return c.json({ data: snapshot });
  } catch {
    c.header("Cache-Control", "no-store");
    return c.json({ error: "行情暂不可用" }, 503);
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
  const markets = await loadDashboard();
  const availability = Object.fromEntries(
    (["CN", "US"] as Market[]).map((market) => [
      market,
      {
        available: !!markets[market].snapshot,
        asOf: markets[market].snapshot?.asOf ?? null,
      },
    ]),
  );
  const healthy = !!markets.CN.snapshot && !!markets.US.snapshot;
  c.header("Cache-Control", "no-store");
  return c.json(
    { data: { status: healthy ? "ok" : "degraded", markets: availability } },
    healthy ? 200 : 503,
  );
});

// Existing authenticated report storage remains available to external writers.
// The signal dashboard above is independent of report publication and D1.
app.use("/api/*", async (c, next) => {
  const origin = c.env.REMOTE_DATA_ORIGIN?.trim();
  if (!origin) return next();
  if (c.req.method !== "GET")
    return c.json(
      { error: { message: "Local API access is read-only.", status: 405 } },
      405,
    );
  const target = new URL(c.req.path, origin);
  if (target.protocol !== "https:")
    return c.json({ error: "Invalid data origin" }, 503);
  target.search = new URL(c.req.url).search;
  const response = await fetch(target, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
app.route("/api", reportWriteRoutes);
app.get("/api/reports", async (c) => {
  if (!c.env.DB)
    return c.json(
      { error: { message: "Database unavailable", status: 503 } },
      503,
    );
  const before = c.req.query("before") ?? null;
  if (before && !datePattern.test(before))
    return c.json(
      { error: { message: "Before must be YYYY-MM-DD.", status: 400 } },
      400,
    );
  const requested = Number(c.req.query("limit") ?? 30);
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(100, Math.trunc(requested)))
    : 30;
  const data = await getDailyArchive(c.env.DB, limit, before);
  return c.json({ data, meta: { total: data.length, limit } });
});
for (const [path, kind] of [
  ["/api/reports/:date", "daily"],
  ["/api/weekly/:date", "weekly"],
] as const) {
  app.get(path, async (c) => {
    const date = c.req.param("date");
    if (!datePattern.test(date))
      return c.json(
        { error: { message: "Date must be YYYY-MM-DD.", status: 400 } },
        400,
      );
    if (!c.env.DB)
      return c.json(
        { error: { message: "Database unavailable", status: 503 } },
        503,
      );
    const result = await readApiReport(c.env.DB, kind, date);
    if (!result)
      return c.json(
        { error: { message: "Report not found.", status: 404 } },
        404,
      );
    c.header("Cache-Control", "no-store");
    c.header("ETag", result.meta.etag);
    return c.json(result);
  });
}
app.get("/", async () => {
  const markets = await loadDashboard();
  const stream = await renderToReadableStream(
    <Document data={{ markets, requestUrl: `${productionOrigin}/` }} />,
  );
  return new Response(stream, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
});
app.get("/weekly", (c) => c.redirect("/", 308));
app.get("/weekly/", (c) => c.redirect("/", 308));
app.onError((error, c) => {
  console.error("Request failed", error);
  return c.json({ error: "暂时无法读取数据" }, 503);
});
app.notFound((c) => c.json({ error: "未找到页面" }, 404));
export default app;
