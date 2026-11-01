import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { preparedDB, fixtureNow } from './market-fixture.mjs';
test('bounded D1 JSON projection equals the source-isolated dated observations and preserves revision/failure semantics', async () => { const now = Date.now; let clock = fixtureNow; Date.now = () => clock; const vite = await createServer({ configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }), f = await preparedDB(vite); try {
    const { sentimentView } = await vite.ssrLoadModule('/src/server/sentiment-view.ts'), { loadSentiment } = await vite.ssrLoadModule('/src/server/sentiment-store.ts');
    f.sqlite.prepare("UPDATE sentiment_daily SET score=? WHERE market='US' AND source='cnn_whit3rabbit' AND date='2026-06-01'").run(26.200000762939453);
    for (const market of ['CN', 'US']) {
        const expected = await loadSentiment(market, f.wrap(), 'https://test.example', '2026-10-30'), actual = await sentimentView(f.db, market, '2026-10-30');
        assert.deepEqual(JSON.parse(actual.json), expected);
        assert.equal(await sentimentView(f.db, market, '2026-10-30'), actual);
    }
    const first = await sentimentView(f.db, 'US', '2026-10-30');
    clock += 300001;
    f.sqlite.prepare("UPDATE sentiment_daily SET score=21.5,updated_at=? WHERE source='cnn_benzinga'").run(new Date(clock).toISOString());
    const revised = await sentimentView(f.db, 'US', '2026-10-30');
    assert.notEqual(revised.revision, first.revision);
    assert.equal(JSON.parse(revised.json).reportedObservations[0].value, 21.5);
    assert.deepEqual(JSON.parse(revised.json).observations, JSON.parse(first.json).observations);
    clock += 300001;
    f.stats.fail = true;
    assert.equal(await sentimentView(f.db, 'US', '2026-10-30'), revised);
    const before = f.stats.reads;
    assert.equal(await sentimentView(f.db, 'US', '2026-10-30'), revised);
    assert.equal(f.stats.reads, before);
    assert.ok(f.stats.sql.some(sql => sql.includes('LIMIT 745')));
}
finally {
    f.close();
    Date.now = now;
    await vite.close();
} });
