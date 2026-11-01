import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { preparedDB, fixtureNow as initial } from './market-fixture.mjs';
let vite, fixture, app, clock = initial, calls = 0;
const real = { fetch: globalThis.fetch, now: Date.now, caches: globalThis.caches }, edge = new Map();
before(async () => { Date.now = () => clock; globalThis.fetch = async () => { calls++; throw Error('No reader upstream permitted'); }; globalThis.caches = { default: { match: async (r) => edge.get(r.url)?.clone(), put: async (r, b) => edge.set(r.url, b.clone()) } }; vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }); fixture = await preparedDB(vite); app = (await import('../dist/_worker.js?durable-routes')).default; });
after(async () => { fixture.close(); await vite.close(); globalThis.fetch = real.fetch; Date.now = real.now; if (real.caches === undefined)
    delete globalThis.caches;
else
    globalThis.caches = real.caches; });
const request = (path, options = {}, db = fixture.db) => app.request('https://trendbeak.com' + path, options, { SENTIMENT_DB: db });
test('cold full snapshots include bounded annual view, publisher, own technical source, and separate reported sentiment', async () => { for (const market of ['CN', 'US']) {
    const response = await request('/api/markets/' + market);
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.equal(data.bars, undefined);
    assert.equal(data.technicalSource, 'trendbeak_technical_v1');
    assert.equal(data.days.length, 365);
    assert.ok(Object.keys(data.history).length <= 366);
    assert.ok(data.sentiment.observations.length <= 372);
    assert.ok(Buffer.byteLength(JSON.stringify(data)) < 300000);
    assert.equal(data.freshness.via, 'database');
    if (market === 'US') {
        assert.match(data.sentiment.source.url, /whit3rabbit/);
        assert.equal(data.sentiment.reportedObservations.find(r => r.date === '2026-03-12').value, 21.2);
    }
} assert.equal(calls, 0); assert.equal(fixture.stats.writes, 0); });
test('unchanged API uses revision ETag with an empty 304 response; source-specific correction invalidates it', async () => { const first = await request('/api/markets/US'), etag = first.headers.get('ETag'); await first.text(); const before = fixture.stats.reads, same = await request('/api/markets/US', { headers: { 'If-None-Match': etag } }); assert.equal(same.status, 304); assert.equal(await same.text(), ''); assert.equal(fixture.stats.reads, before); clock += 300001; edge.clear(); fixture.sqlite.prepare("UPDATE sentiment_daily SET score=21.5,updated_at=? WHERE source='cnn_benzinga'").run(new Date(clock).toISOString()); const corrected = await request('/api/markets/US', { headers: { 'If-None-Match': etag } }); assert.equal(corrected.status, 200); assert.notEqual(corrected.headers.get('ETag'), etag); assert.equal((await corrected.json()).data.sentiment.reportedObservations[0].value, 21.5); assert.equal(calls, 0); });
test('discarding every app/edge cache retains durable historical data and does zero quote fetches', async () => { clock += 300001; edge.clear(); const independent = (await import('../dist/_worker.js?durable-cold')).default; const response = await independent.request('https://trendbeak.pages.dev/api/markets/CN', {}, { SENTIMENT_DB: fixture.wrap() }); assert.equal(response.status, 200); assert.equal((await response.json()).data.fetchedAt, new Date(initial).toISOString()); assert.equal(calls, 0); });
test('unknown stock is explicit 404 without a benchmark substitution or initialization; page remains cheap', async () => { const missing = await request('/api/markets/US?symbol=TSLA'); assert.equal(missing.status, 404); assert.equal((await missing.json()).code, 'snapshot_missing'); const reads = fixture.stats.reads, page = await request('/'); assert.equal(page.status, 200); const html = await page.text(); assert.ok(Buffer.byteLength(html) < 20000); assert.doesNotMatch(html, /trend-chart|radar-axis/); assert.equal(fixture.stats.reads, reads); assert.equal(calls, 0); });
test('health only reads two metadata records and reports actual observation age', async () => { const response = await request('/api/health'); assert.equal(response.status, 503); const health = (await response.json()).data; assert.equal(health.markets.CN.available, true); assert.equal(health.markets.CN.freshness.state, 'stale'); assert.match(fixture.stats.sql.at(-1), /SELECT key, json_extract/); assert.equal(calls, 0); });
