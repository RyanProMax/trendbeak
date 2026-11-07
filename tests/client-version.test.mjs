import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { preparedDB, fixtureNow as now } from './market-fixture.mjs';
let vite, fixture;
const oldNow = Date.now;
before(async () => { Date.now = () => now; vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }); fixture = await preparedDB(vite); });
after(async () => { Date.now = oldNow; fixture.close(); await vite.close(); });
test('already-open unversioned clients receive full V1 snapshots without a reload, new header or server recomputation', async () => { const app = (await vite.ssrLoadModule('/src/worker.tsx')).default, validator = await vite.ssrLoadModule('/src/lib/snapshot-record.ts'), response = await app.request('https://test.example/api/markets/US?symbol=%5EGSPC', {}, { SENTIMENT_DB: fixture.db }); assert.equal(response.status, 200); const data = (await response.json()).data; assert.ok(validator.validRecord(validator.recordFromSnapshot(data), 'US', '^GSPC', now)); assert.ok(Object.keys(data.history).length > 200); assert.equal(data.days.length, 365); assert.equal(data.bars, undefined); });
test('quote helper remains ordinary fetch and needs no service worker or reload hook', async () => { const version = await vite.ssrLoadModule('/src/lib/client-version.ts'), saved = globalThis.fetch; let init; globalThis.fetch = async (url, value) => { init = value; return Response.json({ data: null }); }; try {
    await version.fetchQuote('/api/markets/US');
    assert.equal(new Headers(init?.headers).get('X-Trendbeak-Data'), null);
}
finally {
    globalThis.fetch = saved;
} });
