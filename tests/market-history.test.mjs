import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "vite";
let vite, signals, sentiment;
before(async () => {
  vite = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  signals = await vite.ssrLoadModule("/src/lib/market-signals.ts");
  sentiment = await vite.ssrLoadModule("/src/server/sentiment-data.ts");
});
after(async () => {
  await vite?.close();
});
function bars() {
  return Array.from({ length: 600 }, (_, i) => {
    const close = 100 + i * 0.2 + Math.sin(i / 7) * 5;
    return {
      date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
      open: close,
      close,
      high: close + 2,
      low: close - 2,
      volume: 1000 + i * 3,
    };
  });
}
test("historical indicators and 52-week bounds exclude all future bars", () => {
  const rows = bars(),
    date = rows[400].date;
  const history = signals.buildHistory(rows, rows.at(-1).date, true);
  const expected = signals.calculateSignals(rows.slice(0, 401));
  for (const signal of expected) {
    assert.equal(history[date].values[signal.id], signal.value);
    assert.equal(history[date].previous[signal.id], signal.previous);
  }
  const changed = rows.map((row, i) =>
    i > 400
      ? {
          ...row,
          open: row.open * 10,
          close: row.close * 10,
          high: row.high * 10,
          low: row.low * 10,
          volume: row.volume * 50,
        }
      : row,
  );
  assert.deepEqual(
    signals.buildHistory(changed, rows.at(-1).date, true)[date],
    history[date],
  );
  assert.notEqual(history[date].values.volume, null);
  assert.equal(history[rows.at(-1).date].values.volume, null);
  assert.deepEqual(
    history[date].range,
    signals.rangeBounds(rows.slice(0, 401)),
  );
});
test("selection is exact-date, retains prior values and does not fill weekends with latest readings", () => {
  const rows = bars(),
    date = rows[450].date,
    last = rows.at(-1).date;
  const snapshot = {
    instrument: { market: "US" },
    asOf: last,
    session: "trading",
    signals: signals.calculateSignals(rows, true),
    history: signals.buildHistory(rows, last, true),
    days: [{ date: "2026-08-16", status: "closed" }],
    sentiment: {
      source: { name: "Test source", url: "https://example.test" },
      description: "Market-wide",
      observations: [{ date: last, value: 66, previous: 65 }],
    },
  };
  const past = signals.signalsForDate(snapshot, date);
  assert.equal(past.length, 5);
  assert.equal(past[0].value, null);
  assert.equal(past[3].value, snapshot.history[date].values.volume);
  assert.equal(past[3].unavailable, null);
  assert.match(past[4].note, /52 周低点/);
  delete snapshot.history["2026-08-16"];
  const weekend = signals.signalsForDate(snapshot, "2026-08-16");
  assert.ok(weekend.every((s) => s.value === null));
  assert.ok(weekend.every((s) => s.unavailable.includes("休市")));
  assert.equal(signals.signalsForDate(snapshot, last)[0].value, 66);
});
test("CN sentiment validates scores and dates, preserving the published historical sequence", () => {
  const now = Date.parse("2026-10-28T15:00:00Z");
  const result = sentiment.parseChinaSentiment(
    "date,fear_greed_index\n2026-10-27,25.09\n2026-10-28,41.94\n",
    now,
  );
  assert.deepEqual(result.observations, [
    { date: "2026-10-27", value: 25.09, previous: null },
    { date: "2026-10-28", value: 41.94, previous: 25.09 },
  ]);
  for (const text of [
    "date,value\n2026-10-28,41",
    "date,fear_greed_index\n2026-10-28,101",
    "date,fear_greed_index\n2026-10-29,41",
    "date,fear_greed_index\n2026-10-28,",
    "date,fear_greed_index\n2026-10-28,41\n2026-10-28,40",
  ])
    assert.throws(() => sentiment.parseChinaSentiment(text, now));
});
test("US relay never substitutes crypto, stale values or undated comparisons for stock history", () => {
  const now = Date.parse("2026-10-28T15:00:00Z");
  const payload = {
    stocks: {
      reading: {
        value: 34.45,
        updatedAt: "2026-10-28T14:36:31Z",
        stale: false,
        history: { yesterday: 33.6, week: 30 },
      },
    },
    crypto: { reading: { value: 80 } },
  };
  const result = sentiment.parseUSSentiment(payload, now);
  assert.deepEqual(result.observations, [
    { date: "2026-10-28", value: 34.45, previous: 33.6 },
  ]);
  assert.match(result.source.name, /转引 CNN/);
  assert.throws(() =>
    sentiment.parseUSSentiment({ crypto: payload.crypto }, now),
  );
  for (const patch of [
    { value: 101 },
    { value: null },
    { stale: true },
    { updatedAt: "2027-01-01T00:00:00Z" },
  ])
    assert.throws(() =>
      sentiment.parseUSSentiment(
        { stocks: { reading: { ...payload.stocks.reading, ...patch } } },
        now,
      ),
    );
});
