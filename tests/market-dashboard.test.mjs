import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "vite";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let vite, app;
const realFetch = globalThis.fetch;
const seen = [];
const through = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const dates = Array.from({ length: 400 }, (_, i) =>
  new Date(Date.parse(through) - (399 - i) * 86400000)
    .toISOString()
    .slice(0, 10),
);
before(async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    seen.push(url);
    if (url.hostname === "web.ifzq.gtimg.cn") {
      const quote = Array(31).fill("");
      quote[1] = "沪深 300";
      quote[2] = "000300";
      return Response.json({
        code: 0,
        data: {
          sh000300: {
            qt: { sh000300: quote },
            day: dates.map((date) => [date, "99", "100", "101", "98", "1000"]),
          },
        },
      });
    }
    if (url.hostname.endsWith(".finance.yahoo.com")) {
      if (!url.pathname.endsWith("%5EGSPC"))
        return new Response("unavailable", { status: 503 });
      return Response.json({
        chart: {
          error: null,
          result: [
            {
              meta: {
                symbol: "^GSPC",
                exchangeTimezoneName: "America/New_York",
                currency: "USD",
              },
              timestamp: dates.map(
                (date) => Date.parse(`${date}T14:30:00Z`) / 1000,
              ),
              indicators: {
                quote: [
                  {
                    open: dates.map(() => 99),
                    high: dates.map(() => 101),
                    low: dates.map(() => 98),
                    close: dates.map(() => 100),
                    volume: dates.map(() => 1000),
                  },
                ],
              },
            },
          ],
        },
      });
    }
    if (url.hostname === "searchapi.eastmoney.com")
      return Response.json({
        QuotationCodeTable: {
          Data: [
            {
              Code: "NVDA",
              Name: "英伟达",
              Classify: "UsStock",
              MktNum: "105",
            },
          ],
        },
      });
    throw new Error(`Unexpected origin: ${url.hostname}`);
  };
  vite = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  app = (await vite.ssrLoadModule("/src/worker.tsx")).default;
});
after(async () => {
  globalThis.fetch = realFetch;
  await vite?.close();
});
const request = (path) =>
  app.request(`https://example.test${path}`);

test("dashboard SSR renders both markets and 365 real day cells per market without D1", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const document = new JSDOM(await response.text()).window.document;
  assert.equal(document.querySelectorAll(".market-card").length, 2);
  assert.deepEqual(
    [...document.querySelectorAll(".market-card")].map(
      (el) => el.dataset.market,
    ),
    ["CN", "US"],
  );
  assert.equal(
    document.querySelectorAll(".calendar-section button[data-date]").length,
    730,
  );
  assert.equal(document.querySelectorAll(".signal-trigger").length, 10);
  assert.equal(document.querySelectorAll("[aria-expanded]").length, 1); // Only the stock combobox.
  assert.equal(
    document.querySelectorAll(".signal-detail,details,.sample-pill").length,
    0,
  );
  const data = JSON.parse(
    document.querySelector("#trendbeak-data").textContent,
  );
  assert.equal(data.markets.CN.snapshot.price, 100);
  assert.equal(data.markets.US.snapshot.price, 100);
  document.querySelector("#trendbeak-data").remove();
  assert.doesNotMatch(
    document.body.textContent,
    /示例数据|日报|周报|\d{4}-\d{2}-\d{2}|API Skill|contractVersion/,
  );
});
test("market and search routes reject unbounded or hostile input", async () => {
  const response = await request("/api/markets");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.CN.snapshot.days.length, 365);
  const search = await request("/api/search?q=NVDA");
  assert.equal(search.status, 200);
  assert.equal((await search.json()).data[0].symbol, "NVDA");
  assert.equal((await request("/api/search?q=" + "a".repeat(61))).status, 400);
  assert.equal((await request("/api/search?q=%00")).status, 400);
  assert.equal((await request("/api/markets/ZZ")).status, 400);
  assert.equal(
    (await request("/api/markets/US?symbol=https://evil.test")).status,
    400,
  );
  assert.equal((await request("/api/markets/CN?symbol=NVDA")).status, 400);
});
test("failed individual quotes return no fabricated price and do not poison the other market", async () => {
  const response = await request("/api/markets/US?symbol=NVDA");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "行情暂不可用" });
  assert.equal((await request("/api/markets/CN")).status, 200);
  assert.equal((await request("/api/health")).status, 200);
});
test("removed product routes have no readers, writers or redirects", async () => {
  for (const path of ["/weekly", "/weekly/", "/api/reports", "/api/reports/2026-10-28", "/api/weekly/2026-10-25"]) {
    assert.equal((await request(path)).status, 404);
    const result = await app.request(`https://example.test${path}`, { method: "PUT", body: "{}", headers: { "content-type": "application/json" } });
    assert.equal(result.status, 404);
  }
});
test("market names and hydration data cannot escape HTML, including partial outages", async () => {
  const { default: Document } = await vite.ssrLoadModule("/src/App.tsx");
  const attack =
    '</script><img src=x onerror="globalThis.marketXss=1"><script>globalThis.marketXss=1</script>';
  const markets = (await (await request("/api/markets")).json()).data;
  markets.CN.instrument.name = attack;
  markets.US.snapshot = null;
  markets.US.error = "行情暂不可用";
  const html = renderToStaticMarkup(
    React.createElement(Document, {
      data: { markets, requestUrl: "https://example.test/" },
    }),
  );
  assert.doesNotMatch(html, /<img src=x|<script>globalThis.marketXss/);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll(".signals").length, 1);
  assert.equal(
    document.querySelector("[data-market=US] .market-empty").textContent,
    "行情暂不可用重试",
  );
  assert.equal(
    JSON.parse(document.querySelector("#trendbeak-data").textContent).markets
      .CN.instrument.name,
    attack,
  );
});
