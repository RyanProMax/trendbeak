import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

let vite, importer, store, sql;
const clock = Date.parse("2026-11-01T08:00:00Z");
before(async () => {
  sql = readFileSync("migrations/0001_sentiment_daily.sql", "utf8");
  vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false, ws: false } });
  importer = await vite.ssrLoadModule("/src/server/sentiment-import.ts");
  store = await vite.ssrLoadModule("/src/server/sentiment-store.ts");
});
after(async () => { await vite?.close(); });
function database() { const sqlite = new DatabaseSync(":memory:"); sqlite.exec(sql); return sqlite; }
function adapter(sqlite) {
  return { reads: 0, prepare(query) { return { bind: (...values) => ({ all: async () => { this.reads++; return { success: true, results: sqlite.prepare(query).all(...values) }; } }) }; } };
}
const query = (market = "US", source = "cnn_whit3rabbit") => ({ market, source, from: "2026-03-01", to: "2026-10-31" });
function write(db, market, source, rows, mode = "seed", now = clock) { db.exec(importer.sentimentImportSQL(market, source, rows, mode, now)); }

test("single table has only five fields and rejects bad dates, scores, and mismatched sources", () => {
  const db = database();
  assert.deepEqual(db.prepare("PRAGMA table_info(sentiment_daily)").all().map(r => r.name), ["market", "date", "source", "score", "updated_at"]);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name), ["sentiment_daily"]);
  const insert = db.prepare("INSERT INTO sentiment_daily(market,date,source,score) VALUES(?,?,?,?)");
  for (const params of [["XX", "2026-03-01", "self_v0_2", 20], ["CN", "2026-02-30", "baifenwei", 20], ["CN", "2026-03-01", "cnn_whit3rabbit", 20], ["US", "2026-03-01", "cnn_whit3rabbit", -1], ["US", "2026-03-01", "cnn_whit3rabbit", 101], ["US", "2026-03-01", "cnn_whit3rabbit", null]]) assert.throws(() => insert.run(...params));
  db.close();
});
test("seed idempotency, no overwrite after revision, unchanged timestamps, and independent source keys", () => {
  const db = database(), rows = [{ date: "2026-03-11", score: 20 }, { date: "2026-03-13", score: 30 }];
  write(db, "US", "cnn_whit3rabbit", rows);
  const initial = db.prepare("SELECT * FROM sentiment_daily ORDER BY date").all();
  write(db, "US", "cnn_whit3rabbit", rows, "seed", clock + 1000);
  assert.deepEqual(db.prepare("SELECT * FROM sentiment_daily ORDER BY date").all(), initial);
  write(db, "US", "self_v0_2", [{ date: "2026-03-11", score: 99 }]);
  write(db, "US", "cnn_whit3rabbit", [{ date: "2026-03-11", score: 25 }], "sync", clock + 2000);
  write(db, "US", "cnn_whit3rabbit", rows, "seed", clock + 3000);
  const revised = db.prepare("SELECT * FROM sentiment_daily WHERE source='cnn_whit3rabbit' ORDER BY date").all();
  assert.deepEqual(revised.map(r => r.score), [25, 30]);
  assert.equal(revised[0].updated_at, new Date(clock + 2000).toISOString());
  assert.equal(revised[1].updated_at, initial[1].updated_at);
  write(db, "US", "cnn_whit3rabbit", [{ date: "2026-03-11", score: 25 }], "sync", clock + 4000);
  assert.deepEqual(db.prepare("SELECT * FROM sentiment_daily WHERE source='cnn_whit3rabbit' ORDER BY date").all(), revised);
  assert.equal(db.prepare("SELECT score FROM sentiment_daily WHERE source='self_v0_2'").get().score, 99);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sentiment_daily WHERE date='2026-03-12'").get().n, 0);
  db.close();
});
test("whole import rejects duplicates, future dates, and invalid values before producing SQL", () => {
  assert.throws(() => importer.sentimentImportSQL("bad-market", "self_v0_2", [{ date: "2026-03-11", score: 10 }], "seed", clock));
  for (const rows of [[], [{ date: "2026-02-30", score: 10 }], [{ date: "2026-11-02", score: 10 }], [{ date: "2026-03-11", score: NaN }], [{ date: "2026-03-11", score: 10 }, { date: "2026-03-11", score: 11 }]]) assert.throws(() => importer.sentimentImportSQL("US", "cnn_whit3rabbit", rows, "seed", clock));
});
test("snapshot hits, cold edge hits, expiration, eviction, singleflight, and source isolation", async () => {
  const sqlite = database();
  write(sqlite, "US", "cnn_whit3rabbit", [{ date: "2026-03-11", score: 20 }]);
  write(sqlite, "US", "self_v0_2", [{ date: "2026-03-11", score: 90 }]);
  const db = adapter(sqlite), bodies = new Map(); let now = clock;
  const edge = { match: async req => bodies.get(req.url)?.clone(), put: async (req, body) => bodies.set(req.url, body.clone()) };
  const warm = store.createSentimentStore(() => now);
  const results = await Promise.all(Array.from({ length: 5 }, () => warm.read(db, query(), undefined, edge)));
  assert.equal(db.reads, 1); assert.equal(results[0].rows[0].source, "cnn_whit3rabbit");
  await warm.read(db, query(), undefined, edge); assert.equal(db.reads, 1);
  await store.createSentimentStore(() => now).read(db, query(), undefined, edge); assert.equal(db.reads, 1);
  const own = await warm.read(db, query("US", "self_v0_2"), undefined, edge); assert.equal(own.rows[0].score, 90); assert.equal(db.reads, 2);
  now += store.SENTIMENT_TTL_MS;
  write(sqlite, "US", "cnn_whit3rabbit", [{ date: "2026-03-11", score: 22 }], "sync", now);
  assert.equal((await warm.read(db, query(), undefined, edge)).rows[0].score, 22); assert.equal(db.reads, 3);
  bodies.clear(); await store.createSentimentStore(() => now).read(db, query(), undefined, edge); assert.equal(db.reads, 4);
  const badEdge = { match: async () => Response.json({ storedAt: new Date(now).toISOString(), rows: [{ market: "US", source: "self_v0_2", date: "2026-03-11", score: 90, updated_at: new Date(now).toISOString() }] }) };
  assert.equal((await store.createSentimentStore(() => now).read(db, query(), undefined, badEdge)).rows[0].source, "cnn_whit3rabbit");
  assert.equal(db.reads, 5); sqlite.close();
});
test("API returns dates, scores and actual source from D1 only, validates filters and binding failures", async () => {
  const app = (await import("../dist/_worker.js?sentiment-d1")).default, sqlite = database(), db = adapter(sqlite);
  write(sqlite, "US", "cnn_whit3rabbit", [{ date: "2026-03-11", score: 20 }]);
  write(sqlite, "US", "self_v0_2", [{ date: "2026-03-11", score: 90 }]);
  const url = "https://test.example/api/sentiment/US?from=2026-03-01&to=2026-03-31";
  const response = await app.request(url, {}, { SENTIMENT_DB: db }); assert.equal(response.status, 200);
  const { data } = await response.json(); assert.equal(data.source, "cnn_whit3rabbit"); assert.equal(data.rows.length, 1); assert.equal(data.rows[0].source, "cnn_whit3rabbit"); assert.equal(data.rows[0].score, 20); assert.equal(data.sourceInfo.publisher, "CNN"); assert.match(data.sourceInfo.channel, /非 CNN 直连/);
  const own = await app.request(url + "&source=self_v0_2", {}, { SENTIMENT_DB: db }); assert.equal((await own.json()).data.rows[0].score, 90);
  for (const path of ["/api/sentiment/XX", "/api/sentiment/CN?source=cnn_whit3rabbit", "/api/sentiment/US?from=2026-02-30", "/api/sentiment/US?from=2026-04-01&to=2026-03-01"]) assert.equal((await app.request("https://test.example" + path, {}, { SENTIMENT_DB: db })).status, 400);
  const missing = await app.request(url); assert.equal(missing.status, 503); assert.equal(missing.headers.get("Cache-Control"), "no-store");
  sqlite.close();
});
