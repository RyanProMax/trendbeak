import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "vite";
let vite, store;
const realFetch = globalThis.fetch;
before(async () => {
  vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false, ws: false } });
  store = await vite.ssrLoadModule("/src/server/sentiment-store.ts");
});
after(async () => { globalThis.fetch = realFetch; await vite?.close(); });
test("cold page sentiment reads retained database history even when every upstream is down", async () => {
  let upstreamCalls = 0, reads = 0;
  globalThis.fetch = async () => { upstreamCalls++; throw Error("upstream unavailable"); };
  const db = { prepare() { return { bind(_market, source) { return { all: async () => { reads++; return { success: true, results: source === "cnn_benzinga" ? [] : [{ market: "US", source: "cnn_whit3rabbit", date: "2026-03-11", score: 25, updated_at: "2026-10-31T00:00:00Z" }] }; } }; } }; } };
  const first = await store.loadSentiment("US", db);
  assert.equal(first.error, undefined);
  assert.deepEqual(first.observations.map(p => [p.date, p.value]), [["2026-03-11", 25]]);
  assert.match(first.source.name, /社区存档/);
  assert.match(first.description, /非 CNN 直连/);
  await store.loadSentiment("US", db);
  assert.equal(reads, 2); assert.equal(upstreamCalls, 0);
});
test("missing database binding returns unavailable without an upstream fallback", async () => {
  globalThis.fetch = async () => { throw Error("must never fetch"); };
  const result = await store.loadSentiment("CN");
  assert.deepEqual(result.observations, []); assert.ok(result.error);
});
