import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "vite";
let vite, series, paths, palette;
before(async () => {
  vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false } });
  series = await vite.ssrLoadModule("/src/lib/chart-series.ts");
  paths = await vite.ssrLoadModule("/src/lib/chart-path.ts");
  palette = await vite.ssrLoadModule("/src/lib/brand-palette.ts");
});
after(async () => { await vite?.close(); });
function fixture() {
  return {
    instrument: { market: "US", name: "S&P 500" }, asOf: "2026-10-29",
    days: [
      { date: "2026-10-23", status: "trading" }, { date: "2026-10-24", status: "closed" },
      { date: "2026-10-25", status: "closed" }, { date: "2026-10-26", status: "trading" },
      { date: "2026-10-27", status: "missing" }, { date: "2026-10-28", status: "trading" }, { date: "2026-10-29", status: "trading" },
    ],
    history: Object.fromEntries([['2026-10-23', 100], ['2026-10-26', 102], ['2026-10-28', 101], ['2026-10-29', 103]].map(([date, price]) => [date, { price, change: 1 }])),
    sentiment: { observations: [{ date: "2026-10-29", value: 36.5 }] },
  };
}
test("natural-day windows preserve the chosen extent up to one year", () => {
  for (const range of [7,30,64,90,111,180,365]) {
    const result=series.trendSeries(fixture(),fixture(),"2026-10-29",range);
    assert.equal((Date.parse(result.end)-Date.parse(result.start))/86400000,range-1);
    assert.equal(result.days.length,range);
  }
});

test("calendar inspection does not move the chart window or replace exact-date readings", () => {
  const snapshot = fixture(), before = series.trendSeries(snapshot, snapshot, snapshot.asOf, 30);
  assert.deepEqual(series.trendReading(snapshot, snapshot, "2026-10-28"), { date: "2026-10-28", mood: null, price: 101, closed: false });
  assert.deepEqual(series.trendReading(snapshot, snapshot, "2026-10-24"), { date: "2026-10-24", mood: null, price: null, closed: true });
  assert.deepEqual(series.trendReading(snapshot, snapshot, "2026-10-27"), { date: "2026-10-27", mood: null, price: null, closed: false });
  assert.equal(series.trendReading(snapshot, snapshot, "2026-01-02").price, null);
  assert.deepEqual(series.trendSeries(snapshot, snapshot, snapshot.asOf, 30), before);
});
test("missing sessions split paths and a singleton emotion observation remains a single point", () => {
  const snapshot = fixture(), result = series.trendSeries(snapshot, snapshot, snapshot.asOf, 30);
  assert.deepEqual(result.priceSegments.map(points => points.map(point => point.date)), [["2026-10-23", "2026-10-26"], ["2026-10-28", "2026-10-29"]]);
  assert.deepEqual(result.moodSegments.map(points => points.length), [1]);
  assert.deepEqual(result.mood.map(point => point.date), ["2026-10-29"]);
});
test("monotone display paths preserve observations and introduce no extra extrema", () => {
  const points = [2, 8, 4, 5, 1].map((value, date) => ({ date: String(date), value }));
  const path = paths.chartPath(points, Number, value => value);
  const tokens = [...path.matchAll(/[MLC]|-?\d+(?:\.\d+)?/g)].map(match => match[0]);
  assert.equal(tokens.shift(), "M");
  let previous = [Number(tokens.shift()), Number(tokens.shift())], index = 1;
  while (tokens.length) {
    assert.equal(tokens.shift(), "C");
    const values = tokens.splice(0,6).map(Number), [x1,y1,x2,y2,x3,y3] = values;
    assert.deepEqual([x3,y3], [index, points[index].value]);
    const min = Math.min(previous[1], y3) - .001, max = Math.max(previous[1], y3) + .001;
    for (let t = 0; t <= 1; t += .02) {
      const y = (1-t)**3*previous[1] + 3*(1-t)**2*t*y1 + 3*(1-t)*t*t*y2 + t**3*y3;
      assert.ok(y >= min && y <= max);
    }
    assert.ok(x1 >= previous[0] && x2 <= x3);
    previous = [x3,y3]; index++;
  }
  assert.equal(index, points.length);
});

test("emotion colors encode score thresholds continuously rather than time position", () => {
  assert.equal(palette.sentimentColor(0), palette.sentimentColor(20));
  assert.equal(palette.sentimentColor(80), palette.sentimentColor(100));
  for (const stop of palette.EMOTION_STOPS) assert.equal(palette.sentimentColor(stop.value), stop.color);
  assert.notEqual(palette.sentimentColor(35), palette.sentimentColor(65));
  const channels = color => color.startsWith("#") ? [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)) : color.match(/\d+/g).map(Number);
  for(const threshold of [20,40,50,65,80]) {
    const a=channels(palette.sentimentColor(threshold-.001)),b=channels(palette.sentimentColor(threshold+.001));
    assert.ok(a.every((value,i)=>Math.abs(value-b[i])<=1));
  }
});
