import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { preparedDB, compactQuote, fixtureNow as now } from './market-fixture.mjs';
let vite, market, store, fixture;
const original = { fetch: globalThis.fetch, now: Date.now };
let upstream = 0, clock = now;
before(async () => { Date.now = () => clock; globalThis.fetch = async () => { upstream++; throw Error('Reader reached upstream'); }; vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }); fixture = await preparedDB(vite); market = await vite.ssrLoadModule('/src/server/market-data.ts'); store = await vite.ssrLoadModule('/src/server/market-snapshot-store.ts'); });
after(async () => { fixture.close(); globalThis.fetch = original.fetch; Date.now = original.now; await vite.close(); });
test('cold, hot, expired, evicted and independent reader instances only read durable views, never upstream or calculations', async () => { const cache = store.createMarketSnapshotStore(() => clock), before = fixture.stats.reads; const first = await Promise.all(Array.from({ length: 8 }, () => cache.read(fixture.db, 'CN', '000300.SS'))); assert.equal(fixture.stats.reads - before, 1); assert.ok(first.every(x => x === first[0])); assert.ok(Object.isFrozen(first[0])); assert.equal(JSON.parse(first[0].payload).data.bars, undefined); await cache.read(fixture.db, 'CN', '000300.SS'); assert.equal(fixture.stats.reads - before, 1); clock += 300001; await cache.read(fixture.db, 'CN', '000300.SS'); assert.equal(fixture.stats.reads - before, 2); await store.createMarketSnapshotStore(() => clock).read(fixture.db, 'CN', '000300.SS'); assert.equal(fixture.stats.reads - before, 3); await cache.read(fixture.wrap(), 'CN', '000300.SS'); assert.equal(fixture.stats.reads - before, 4); assert.equal(upstream, 0); assert.equal(fixture.stats.writes, 0); assert.ok(fixture.stats.sql.filter(s => s.includes('market_snapshot')).every(s => s.includes("json_extract(payload,'$.http.body')"))); });
test('missing instrument fails explicitly without initialization, and search readiness comes from keys only', async () => { await assert.rejects(market.loadMarket('US', 'TSLA', fixture.db), store.SnapshotMissing); const instruments = await market.markPrepared([{ ...compactQuote('US').instrument }, { ...compactQuote('US', 'TSLA').instrument }], fixture.db); assert.deepEqual(instruments.map(i => i.prepared), [true, false]); assert.equal(upstream, 0); });
test('database snapshot remains readable beyond disposable browser backup age and upstream failure', async () => { clock += 8 * 86400000; const value = JSON.parse((await market.loadMarket('CN', '000300.SS', fixture.db)).body).data; assert.equal(value.freshness.via, 'database'); assert.equal(value.freshness.state, 'stale'); assert.equal(value.fetchedAt, new Date(now).toISOString()); assert.ok(Object.keys(value.history).length > 200); assert.equal(upstream, 0); });
test('offline upstream reader bounds declared and streamed bodies with no automatic retries', async () => { const saved = globalThis.fetch; let calls = 0; try {
    for (const declared of [true, false]) {
        globalThis.fetch = async () => { calls++; return new Response(' '.repeat(512001), { headers: declared ? { 'Content-Length': '512001' } : {} }); };
        await assert.rejects(market.fetchJson(new URL('https://source.example')));
    }
    assert.equal(calls, 2);
}
finally {
    globalThis.fetch = saved;
} });
test('D1 failure after expiry preserves the last immutable view and backs off; empty instances fail boundedly', async () => { const cache = store.createMarketSnapshotStore(() => clock), known = await cache.read(fixture.db, 'US', '^GSPC'); clock += 300001; fixture.stats.fail = true; try {
    const before = fixture.stats.reads, fallback = await cache.read(fixture.db, 'US', '^GSPC');
    assert.equal(fallback, known);
    await cache.read(fixture.db, 'US', '^GSPC');
    assert.equal(fixture.stats.reads - before, 1);
    const empty = store.createMarketSnapshotStore(() => clock);
    await assert.rejects(empty.read(fixture.db, 'US', '^GSPC'));
    const last = fixture.stats.reads;
    await assert.rejects(empty.read(fixture.db, 'US', '^GSPC'));
    assert.equal(fixture.stats.reads, last);
    assert.equal(upstream, 0);
}
finally {
    fixture.stats.fail = false;
} });
test('wrong durable provenance is rejected without an upstream fetch',async()=>{const original=fixture.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key='CN/000300.SS'").get().payload;try{fixture.sqlite.prepare("UPDATE market_snapshot SET payload=json_set(payload,'$.view.source.url','https://other.example/mislabel') WHERE key='CN/000300.SS'").run();await assert.rejects(store.createMarketSnapshotStore(()=>clock).read(fixture.db,'CN','000300.SS'),/invalid/);assert.equal(upstream,0);}finally{fixture.sqlite.prepare("UPDATE market_snapshot SET payload=? WHERE key='CN/000300.SS'").run(original);}});
