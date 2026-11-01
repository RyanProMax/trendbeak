import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
// Build test data in a separate process. No calculation engine runs in a reader.
if (process.argv.includes('--prepare-fixture')) {
    const { createServer } = await import('vite'), { preparedDB, fixtureNow } = await import('../tests/market-fixture.mjs');
    const vite = await createServer({ configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
    try {
        const f = await preparedDB(vite, fixtureNow, { nvda: true });
        await new Promise((resolve, reject) => process.stdout.write(JSON.stringify({ markets: f.sqlite.prepare('SELECT * FROM market_snapshot').all(), sentiment: f.sqlite.prepare('SELECT * FROM sentiment_daily').all() }), error => error ? reject(error) : resolve()));
        f.close();
    }
    finally {
        await vite.close();
    }
    process.exit(0);
}
const child = spawnSync(process.execPath, [import.meta.filename, '--prepare-fixture'], { encoding: 'utf8', maxBuffer: 10000000 });
assert.equal(child.status, 0, child.stderr);
const fixture = JSON.parse(child.stdout), { memoryDB, fixtureNow } = await import('../tests/market-fixture.mjs'), f = memoryDB();
for (const r of fixture.markets)
    f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run(r.key, r.payload, r.updated_at);
for (const r of fixture.sentiment)
    f.sqlite.prepare('INSERT INTO sentiment_daily VALUES(?,?,?,?,?)').run(r.market, r.date, r.source, r.score, r.updated_at);
let now = fixtureNow, calls = 0;
const original = { fetch: globalThis.fetch, now: Date.now, caches: globalThis.caches }, edge = new Map();
Date.now = () => now;
globalThis.caches = { default: { match: async (r) => edge.get(r.url)?.clone(), put: async (r, b) => edge.set(r.url, b.clone()) } };
globalThis.fetch = async () => { calls++; throw Error('Reader attempted upstream access'); };
if (!process.env.BUDGET_FIRST_PATH) {
    await new Response('host initialization').text();
    new Request('https://runtime.example');
}
const results = [];
async function measure(label, fn) { const reads = f.stats.reads, cpu = process.cpuUsage(), t = performance.now(), r = await fn(), bytes = Buffer.byteLength(await r.text()), used = process.cpuUsage(cpu), result = { label, status: r.status, bytes, cpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - t, upstreamCalls: calls, d1Reads: f.stats.reads - reads, d1Writes: f.stats.writes }; results.push(result); return result; }
try {
    const origin = 'https://budget.example', app = (await import('../dist/_worker.js?budget')).default, request = (path, options = {}) => app.request(origin + path, options, { SENTIMENT_DB: f.db });
    if (process.env.BUDGET_FIRST_PATH) {
        await measure('first local Node request including native Web API initialization: ' + process.env.BUDGET_FIRST_PATH, () => request(process.env.BUDGET_FIRST_PATH));
        const all = process.cpuUsage();
        results.push({ label: 'whole parent Node process CPU including fixture orchestration, module import and first response; fixture calculation ran in child; not Worker CPU', cpuMs: (all.user + all.system) / 1000 });
    }
    else if (process.env.BUDGET_BURST) {
        await measure('four simultaneous cold readers, two markets; group CPU, not per-request', async () => { const responses = await Promise.all(['CN', 'CN', 'US', 'US'].map(m => request('/api/markets/' + m))); const texts = await Promise.all(responses.map(r => r.text())); assert.ok(responses.every(r => r.status === 200)); return new Response(texts.join('')); });
        assert.equal(f.stats.reads, 5);
    }
    else {
        const page = await measure('cold SSR shell', () => request('/'));
        assert.ok(page.bytes < 20000);
        assert.equal(f.stats.reads, 0);
        await measure('cold health: two metadata records', () => request('/api/health'));
        await measure('cold CN: materialized view and bounded sentiment', () => request('/api/markets/CN'));
        await measure('cold US: materialized view and bounded sentiment', () => request('/api/markets/US'));
        const first = await request('/api/markets/US'), etag = first.headers.get('etag'), data = (await first.json()).data;
        assert.equal(data.bars, undefined);
        assert.ok(Object.keys(data.history).length <= 366);
        assert.ok(data.sentiment.observations.length <= 372);
        await measure('warm US unchanged: conditional 304', () => request('/api/markets/US', { headers: { 'If-None-Match': etag } }));
        await measure('warm US full view', () => request('/api/markets/US'));
        await measure('warm SSR shell', () => request('/'));
        now += 300001;
        edge.clear();
        await measure('expired/evicted CN: D1 only', () => request('/api/markets/CN'));
        const independent = (await import('../dist/_worker.js?budget-other-isolate')).default;
        edge.clear();
        await measure('independent cold instance after edge eviction: D1 only', () => independent.request(origin + '/api/markets/US', {}, { SENTIMENT_DB: f.wrap() }));
        await measure('missing stock: explicit no initialization', () => request('/api/markets/US?symbol=TSLA'));
        await measure('retired aggregate: no data work', () => request('/api/markets'));
        assert.equal((await request('/api/sentiment/CN?from=1993-08-27')).status, 400);
    }
    assert.equal(calls, 0);
    assert.equal(f.stats.writes, 0);
    const report = { environment: process.env.BUDGET_FIRST_PATH ? 'Fresh local Node process; empty application caches; native Web API initialization included in first response. Fixture creation is isolated in a child before timing; not real Cloudflare cold-start evidence.' : 'Local Node with host Web APIs initialized before timing; empty application cache on cold paths, not runtime startup. SQLite is local synchronous work; Cloudflare D1 waiting/JSON costs differ. Not Cloudflare CPU evidence.', results };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.BUDGET_REPORT)
        await writeFile(process.env.BUDGET_REPORT, JSON.stringify(report, null, 2));
}
finally {
    f.close();
    globalThis.fetch = original.fetch;
    Date.now = original.now;
    if (original.caches === undefined)
        delete globalThis.caches;
    else
        globalThis.caches = original.caches;
}
