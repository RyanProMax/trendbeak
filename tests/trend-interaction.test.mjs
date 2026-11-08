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
  assert.deepEqual(series.trendReading(snapshot, snapshot, "2026-10-28"), { date: "2026-10-28", mood: null, price: 101, change:1, closed: false });
  assert.deepEqual(series.trendReading(snapshot, snapshot, "2026-10-24"), { date: "2026-10-24", mood: null, price: null, change:null, closed: true });
  assert.deepEqual(series.trendReading(snapshot, snapshot, "2026-10-27"), { date: "2026-10-27", mood: null, price: null, change:null, closed: false });
  assert.equal(series.trendReading(snapshot, snapshot, "2026-01-02").price, null);
  assert.deepEqual(series.trendSeries(snapshot, snapshot, snapshot.asOf, 30), before);
});
test("missing sessions split paths and a singleton emotion observation remains a single point", () => {
  const snapshot = fixture(), result = series.trendSeries(snapshot, snapshot, snapshot.asOf, 30);
  assert.deepEqual(result.priceSegments.map(points => points.map(point => point.date)), [["2026-10-23", "2026-10-26"], ["2026-10-28", "2026-10-29"]]);
  assert.deepEqual(result.moodSegments.map(points => points.length), [1]);
  assert.deepEqual(result.mood.map(point => point.date), ["2026-10-29"]);
});
test("dated report fills only the inspected explicit gap with its source, never the default curve", () => {
  const snapshot = fixture(), report = { date: "2026-10-28", value: 21.2, previous: null, source: { name: "CNN／Benzinga同期报道补录", url: "https://www.benzinga.com/example" } };
  snapshot.sentiment.reportedObservations = [report];
  const reading = series.trendReading(snapshot, snapshot, report.date);
  assert.equal(reading.mood, 21.2); assert.deepEqual(reading.moodSource, report.source);
  assert.equal(series.trendSeries(snapshot, snapshot, snapshot.asOf, 30).mood.some(p => p.date === report.date), false);
  snapshot.sentiment.observations.push({ date: report.date, value: 22 });
  assert.equal(series.trendReading(snapshot, snapshot, report.date).mood, 22);
  assert.equal(series.trendReading(snapshot, snapshot, report.date).moodSource, undefined);
});
test("closed state follows each market's calendar or explicit closed day; missing weekdays stay missing", () => {
  const us = fixture();
  assert.equal(series.trendReading(us, us, "2026-07-03").closed, true);
  assert.equal(series.trendReading(us, us, "2026-03-12").closed, false);
  us.days.push({ date: "2026-10-30", status: "closed" });
  assert.equal(series.trendReading(us, us, "2026-10-30").closed, true);
  const cn = { ...fixture(), instrument: { market: "CN" } };
  assert.equal(series.trendReading(cn, cn, "2026-10-01").closed, true);
  assert.equal(series.trendReading(cn, cn, "2026-07-03").closed, false);
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

test("stock trends and exact-date readouts use only the selected stock, never benchmark sentiment or prices", () => {
  const benchmark=fixture(),stock={...fixture(),instrument:{market:'US',kind:'stock',symbol:'AAPL',code:'AAPL',name:'Apple'},history:{'2026-10-28':{price:10,change:1},'2026-10-29':{price:11,change:10}}};
  const result=series.trendSeries(stock,benchmark,stock.asOf,7);
  assert.deepEqual(result.prices,[{date:'2026-10-28',value:10},{date:'2026-10-29',value:11}]);
  assert.deepEqual(result.mood,[]);assert.deepEqual(result.moodSegments,[]);
  assert.deepEqual(series.trendReading(stock,benchmark,'2026-10-29'),{date:'2026-10-29',price:11,change:10,mood:null,closed:false});
  assert.equal(series.trendReading(stock,benchmark,'2026-10-26').price,null);
  assert.deepEqual(series.trendSeries(stock,null,stock.asOf,7).prices,result.prices);
});

test('price changes follow the same exact stock row, retain zero and never borrow benchmark returns',()=>{
 const benchmark=fixture(),stock={...fixture(),instrument:{market:'US',kind:'stock'},history:{'2026-10-29':{price:14,change:0},'2026-10-28':{price:14,change:null}}};
 assert.equal(series.trendReading(stock,benchmark,'2026-10-29').change,0);
 assert.equal(series.trendReading(stock,benchmark,'2026-10-28').change,null);
 assert.equal(series.trendReading(stock,benchmark,'2026-10-26').change,null);
 stock.history['2026-10-29'].change=NaN;assert.equal(series.trendReading(stock,benchmark,'2026-10-29').change,null);
});
