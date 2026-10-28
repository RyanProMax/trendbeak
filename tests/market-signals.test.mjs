import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "vite";
let vite, signals, data, history;
before(async () => {
  vite = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  [signals, data, history] = await Promise.all([
    vite.ssrLoadModule("/src/lib/market-signals.ts"),
    vite.ssrLoadModule("/src/server/market-data.ts"),
    vite.ssrLoadModule("/src/lib/search-history.ts"),
  ]);
});
after(async () => {
  await vite?.close();
});

function bars(count = 400) {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
    open: 60,
    close: 60,
    high: 110,
    low: 10,
    volume: 100,
  }));
}
test("Wilder RSI matches a published hand-worked seed and handles flat/rising/falling sequences", () => {
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28,
  ];
  assert.ok(Math.abs(signals.rsi(closes) - 70.464135021097) < 1e-9);
  assert.equal(signals.rsi(Array.from({ length: 30 }, (_, i) => i + 1)), 100);
  assert.equal(signals.rsi(Array.from({ length: 30 }, (_, i) => 30 - i)), 0);
  assert.equal(signals.rsi(Array(30).fill(5)), 50);
  assert.equal(signals.rsi([1, 2, 3]), null);
  assert.equal(signals.rsi([...closes, NaN]), null);
});
test("volume denominator excludes the current day; trend uses 20 closes; range uses a whole year", () => {
  const rows = bars();
  rows.at(-1).volume = 200;
  rows.at(-1).close = 70;
  const result = Object.fromEntries(
    signals.calculateSignals(rows).map((s) => [s.id, s]),
  );
  assert.equal(result.volume.value, 2);
  assert.equal(result.volume.previous, 1);
  assert.ok(Math.abs(result.trend.value - (70 / 60.5 - 1) * 100) < 1e-9);
  assert.equal(result.range.value, 60);
  assert.equal(
    signals.calculateSignals(rows, true).find((s) => s.id === "volume").value,
    null,
  );
  assert.equal(
    signals.calculateSignals(rows.slice(-30)).find((s) => s.id === "range")
      .value,
    null,
  );
  rows.at(-2).volume = null;
  assert.equal(
    signals.calculateSignals(rows).find((s) => s.id === "volume").value,
    null,
  );
});
test("calendar preserves missing observations and never invents zero changes", () => {
  const rows = [
    { ...bars(1)[0], date: "2026-10-23", close: 100 },
    { ...bars(1)[0], date: "2026-10-26", close: 110 },
  ];
  const calendar = signals.buildCalendar(rows, "2026-10-28");
  assert.equal(calendar.length, 365);
  assert.equal(calendar.at(-1).status, "missing");
  assert.equal(calendar.at(-1).change, null);
  assert.equal(calendar.find((d) => d.date === "2026-10-24").status, "closed");
  assert.ok(
    Math.abs(calendar.find((d) => d.date === "2026-10-26").change - 10) < 1e-9,
  );
  assert.equal(calendar.find((d) => d.date === "2026-10-23").change, null);
});
test("daily bars reject duplicated dates, impossible ranges and future data", () => {
  const rows = bars(2);
  assert.throws(
    () => signals.validateBars([...rows, rows[0]], "2026-10-28"),
    /Duplicate/,
  );
  assert.throws(
    () => signals.validateBars([{ ...rows[0], high: 1 }], "2026-10-28"),
    /range/,
  );
  assert.throws(
    () =>
      signals.validateBars([{ ...rows[0], date: "2027-01-01" }], "2026-10-28"),
    /date/,
  );
  assert.equal(signals.isDate("2026-02-31"), false);
});

test("calendar disables verified exchange holidays without treating data gaps or early closes as holidays", () => {
  const cn = signals.buildCalendar([], "2026-10-28", "CN");
  const us = signals.buildCalendar([], "2026-10-28", "US");
  const status = (days, date) => days.find((day) => day.date === date).status;
  for (const date of ["2026-02-16", "2026-10-01", "2026-10-07"])
    assert.equal(status(cn, date), "closed");
  for (const date of ["2025-11-27", "2025-12-25", "2026-04-03", "2026-07-03"])
    assert.equal(status(us, date), "closed");
  for (const date of ["2025-11-28", "2025-12-24", "2026-10-12"])
    assert.equal(status(us, date), "missing");
  assert.equal(status(cn, "2026-10-08"), "missing");
  assert.equal(status(us, "2026-10-01"), "missing");
});
test("search identities are parsed from exchange records and preserve ambiguous numeric tickers", () => {
  const results = data.parseSearch({
    QuotationCodeTable: {
      Data: [
        { Code: "000001", Name: "平安银行", Classify: "AStock", MktNum: "0" },
        { Code: "000001", Name: "上证指数", Classify: "Index", MktNum: "1" },
        { Code: "600519", Name: "贵州茅台", Classify: "AStock", MktNum: "1" },
        { Code: "NVDA", Name: "英伟达", Classify: "UsStock", MktNum: "105" },
        { Code: "NVDA", Name: "英伟达", Classify: "UsStock", MktNum: "105" },
        { Code: "0700", Name: "腾讯控股", Classify: "HK", MktNum: "116" },
        { Code: "BAD", Name: "<script>", Classify: "UsStock", MktNum: "105" },
      ],
    },
  });
  assert.deepEqual(
    results.map((r) => r.symbol),
    ["000001.SZ", "600519.SS", "NVDA"],
  );
  assert.equal(data.validSymbol("US", "https://example.com"), false);
  assert.equal(data.validSymbol("CN", "000001"), false);
});
test("Tencent validates ticker identity and refuses a missing newest session", () => {
  const quote = Array(31).fill("");
  quote[1] = "贵州茅台";
  quote[2] = "600519";
  quote[30] = "20261028160000";
  const payload = {
    code: 0,
    data: {
      sh600519: {
        qt: { sh600519: quote },
        qfqday: [
          ["2026-10-27", "100", "101", "102", "99", "1000"],
          ["2026-10-28", "101", "102", "103", "100", "1200"],
        ],
      },
    },
  };
  const result = data.parseTencent(
    payload,
    "600519.SS",
    Date.parse("2026-10-28T10:00:00Z"),
  );
  assert.equal(result.price, 102);
  assert.equal(result.session, "closed");
  assert.equal(result.asOf, "2026-10-28");
  assert.throws(() => data.parseTencent(payload, "600518.SS"), /identity/);
  const missing = structuredClone(payload);
  missing.data.sh600519.qfqday.pop();
  assert.throws(
    () =>
      data.parseTencent(
        missing,
        "600519.SS",
        Date.parse("2026-10-28T10:00:00Z"),
      ),
    /Latest/,
  );
});
test("Yahoo validates venue, empty bars and in-progress volume", () => {
  const now = Date.parse("2026-10-28T15:00:00Z");
  const payload = {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol: "NVDA",
            exchangeTimezoneName: "America/New_York",
            longName: "NVIDIA",
            currency: "USD",
            currentTradingPeriod: {
              regular: {
                start: Date.parse("2026-10-28T13:30:00Z") / 1000,
                end: Date.parse("2026-10-28T20:00:00Z") / 1000,
              },
            },
          },
          timestamp: [
            Date.parse("2026-10-27T13:30:00Z") / 1000,
            Date.parse("2026-10-28T13:30:00Z") / 1000,
          ],
          indicators: {
            quote: [
              {
                open: [100, 101],
                high: [102, 103],
                low: [99, 100],
                close: [101, 102],
                volume: [1000, 500],
              },
            ],
          },
        },
      ],
    },
  };
  const result = data.parseYahoo(payload, "NVDA", now);
  assert.equal(result.session, "trading");
  assert.equal(result.signals.find((s) => s.id === "volume").value, null);
  assert.throws(() => data.parseYahoo(payload, "AAPL", now), /identity/);
  const missing = structuredClone(payload);
  for (const key of ["open", "high", "low", "close"])
    missing.chart.result[0].indicators.quote[0][key][1] = null;
  assert.throws(() => data.parseYahoo(missing, "NVDA", now), /Missing/);
});
test("search history is capped, deduplicated, ordered by use and resilient to invalid storage", () => {
  let stored = [];
  for (let i = 0; i < 12; i++)
    stored = history.remember(stored, {
      symbol: `A${i}`,
      code: `A${i}`,
      name: `Company ${i}`,
      market: "US",
      kind: "stock",
    });
  assert.equal(stored.length, 10);
  assert.equal(stored[0].symbol, "A11");
  stored = history.remember(stored, stored[4]);
  assert.equal(stored.length, 10);
  assert.equal(stored[0].symbol, "A7");
  assert.deepEqual(history.parseHistory("{broken"), []);
  assert.deepEqual(history.parseHistory("{}"), []);
  assert.equal(
    history.parseHistory(JSON.stringify([...stored, ...stored])).length,
    10,
  );
  assert.deepEqual(
    history.parseHistory(
      JSON.stringify([
        { symbol: "<img>", name: "x", code: "x", market: "US", kind: "stock" },
      ]),
    ),
    [],
  );
});
