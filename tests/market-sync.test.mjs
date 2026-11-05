import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { compactQuote, memoryDB, fixtureNow as now } from './market-fixture.mjs';
let vite, job, initial, prepared;
before(async () => { vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }); job = await vite.ssrLoadModule('/src/server/market-sync.ts'); initial = compactQuote(); prepared = job.prepareMarketState(initial, 'init', undefined, now); });
after(async () => vite?.close());
const quote = (bars, extra = {}) => ({ ...initial, ...extra, bars, asOf: bars.at(-1).date, price: bars.at(-1).close });
test('minimal durable schema projects only the display view, excludes warmup/checkpoints/sentiment', () => { const f = memoryDB(); try {
    assert.deepEqual(f.sqlite.prepare('pragma table_info(market_snapshot)').all().map(r => r.name), ['key', 'payload', 'updated_at']);
    assert.equal(prepared.processed, 500);
    assert.equal(prepared.payload.calculation.bars.length, 500);
    assert.ok(Object.keys(prepared.payload.view.history).length <= 366);
    assert.equal(prepared.payload.view.days.length, 365);
    assert.equal(prepared.payload.view.bars, undefined);
    assert.equal(prepared.payload.view.sentiment, undefined);
    assert.equal(prepared.payload.view.technicalSource, 'trendbeak_technical_v1');
    assert.ok(prepared.bytes < 1800000);
}
finally {
    f.close();
} });
test('unchanged, appended, live-finalized and revised days reuse the correct checkpoint suffix and equal bounded rebuild', () => {
    const bars = initial.bars;
    const same = job.prepareMarketState(quote(bars.slice(-10)), 'sync', prepared.payload, now);
    assert.equal(same.processed, 0);
    assert.deepEqual(same.payload, prepared.payload);
    const next = { ...bars.at(-1), date: '2026-11-02', close: bars.at(-1).close + 1, high: bars.at(-1).high + 1 }, nextNow = Date.parse('2026-11-02T23:00:00Z'), input = quote([...bars.slice(-9), next], { fetchedAt: new Date(nextNow).toISOString() });
    const append = job.prepareMarketState(input, 'sync', prepared.payload, nextNow), full = job.prepareMarketState(quote([...bars, next], { fetchedAt: input.fetchedAt }), 'rebuild', undefined, nextNow);
    assert.equal(append.processed, 1);
    assert.deepEqual(append.payload, full.payload);
    const changed = bars.slice(-10).map(b => ({ ...b }));
    changed[6].close += .25;
    const revision = job.prepareMarketState(quote(changed), 'sync', prepared.payload, now), merged = bars.map(b => changed.find(c => c.date === b.date) ?? b), baseline = job.prepareMarketState(quote(merged), 'rebuild', undefined, now);
    assert.equal(revision.processed, 4);
    assert.deepEqual(revision.payload, baseline.payload);
    for (let i = 0; i < 496; i++)
        assert.deepEqual(revision.payload.calculation.rows[i], prepared.payload.calculation.rows[i]);
    const live = job.prepareMarketState({ ...initial, session: 'trading' }, 'init', undefined, now);
    assert.equal(job.prepareMarketState({ ...input, session: 'closed' }, 'sync', live.payload, nextNow).processed, 2);
});
test('ambiguous price basis, split, stale source, deleted overlap and absent checkpoint preserve old state without auto full fallback', () => { const bars = initial.bars, prior = JSON.stringify(prepared.payload); const changed = bars.slice(-10).map(b => ({ ...b, open: b.open / 2, high: b.high / 2, low: b.low / 2, close: b.close / 2 })); assert.throws(() => job.prepareMarketState(quote(changed), 'sync', prepared.payload, now), job.RebuildRequired); assert.throws(() => job.prepareMarketState(quote(bars.slice(-10)), 'sync', prepared.payload, now, true), job.RebuildRequired); assert.throws(() => job.prepareMarketState(quote(bars.slice(-12, -2)), 'sync', prepared.payload, now), /older/); assert.throws(() => job.prepareMarketState(quote(bars.slice(-10).filter((_, i) => i !== 5)), 'sync', prepared.payload, now), job.RebuildRequired); assert.throws(() => job.prepareMarketState(quote(bars.slice(-10)), 'sync', undefined, now), job.RebuildRequired); assert.throws(() => job.prepareMarketState(quote(bars.slice(-33)), 'sync', prepared.payload, now), /32-bar/); assert.equal(JSON.stringify(prepared.payload), prior); assert.throws(() => job.prepareMarketState(quote(bars.slice(0, -1)), 'rebuild', prepared.payload, now), /older/); });
test('bounded source windows never silently fall through to full history', () => { assert.match(job.syncURL('CN', '000300.SS', 'sync', '2026-10-30', now).searchParams.get('param'), /,,,10,qfq$/); assert.equal(job.syncURL('US', 'NVDA', 'sync', '2026-10-30', now).searchParams.get('range'), '5d'); assert.equal(job.syncURL('US', 'NVDA', 'sync', '2026-10-15', now).searchParams.get('range'), '1mo'); assert.throws(() => job.syncURL('US', 'NVDA', 'sync', '2026-08-01', now), job.RebuildRequired); assert.equal(job.syncURL('US', 'NVDA', 'rebuild', undefined, now).searchParams.get('range'), '2y'); });
test('a six-day interruption selects enough overlap before fetching, without weakening price-basis checks', () => {
    const later = Date.parse('2026-11-05T16:00:00Z');
    assert.equal(job.syncURL('US', '^GSPC', 'sync', '2026-10-30', later).searchParams.get('range'), '1mo');
    assert.equal(job.syncURL('US', '^GSPC', 'sync', '2026-11-03', later).searchParams.get('range'), '5d');
    const additions = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map(date => ({...initial.bars.at(-1), date}));
    const input = bars => quote(bars, {fetchedAt: new Date(later).toISOString()});
    assert.throws(() => job.prepareMarketState(input([...initial.bars.slice(-1), ...additions]), 'sync', prepared.payload, later), job.RebuildRequired);
    const repaired = job.prepareMarketState(input([...initial.bars.slice(-17), ...additions]), 'sync', prepared.payload, later);
    assert.equal(repaired.payload.view.asOf, '2026-11-05');
    assert.equal(repaired.processed, 4);
    assert.deepEqual(repaired.payload.calculation.bars.slice(0, initial.bars.length), initial.bars);
});
test('CAS writer makes initialization idempotent and concurrent updates cannot overwrite one another', async () => { const f = memoryDB(); try {
    const timestamp = await job.writeMarketState(f.db, prepared, undefined, now);
    await assert.rejects(job.writeMarketState(f.db, prepared, undefined, now), /concurrently/);
    const two = await Promise.allSettled([job.writeMarketState(f.db, prepared, timestamp, now + 1), job.writeMarketState(f.db, prepared, timestamp, now + 2)]);
    assert.equal(two.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(two.filter(r => r.status === 'rejected').length, 1);
    assert.equal(f.sqlite.prepare('select count(*) n from market_snapshot').get().n, 1);
}
finally {
    f.close();
} });
test('checkpoint budget stops growth at 800 and explicit rebuild remains possible without rolling every day', () => { const prior = structuredClone(prepared.payload), last = prior.calculation.bars.at(-1); while (prior.calculation.bars.length < 800) {
    const i = prior.calculation.bars.length;
    prior.calculation.bars.unshift({ ...last, date: new Date(Date.parse(prior.calculation.bars[0].date) - 86400000).toISOString().slice(0, 10) });
    prior.calculation.rows.unshift(prior.calculation.rows[0]);
    prior.calculation.states.unshift(prior.calculation.states[0]);
} const next = { ...last, date: '2026-11-02' }, later = Date.parse('2026-11-02T23:00:00Z'), input = quote([...initial.bars.slice(-9), next], { fetchedAt: new Date(later).toISOString() }); assert.throws(() => job.prepareMarketState(input, 'sync', prior, later), /800 bars/); assert.equal(job.prepareMarketState({ ...initial, fetchedAt: new Date(later).toISOString() }, 'rebuild', prior, later).processed, 500); });
test('repairing one inserted missing observation recomputes only its suffix and never uses future bars', () => { const missing = initial.bars.at(-5), short = initial.bars.filter(b => b !== missing), old = job.prepareMarketState(quote(short), 'init', undefined, now), fixed = job.prepareMarketState(quote(initial.bars.slice(-10)), 'sync', old.payload, now); assert.equal(fixed.processed, 5); assert.deepEqual(fixed.payload, prepared.payload); for (let i = 0; i < short.length - 4; i++)
    assert.deepEqual(fixed.payload.calculation.rows[i], old.payload.calculation.rows[i]); });
