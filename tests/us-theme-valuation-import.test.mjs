import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryDB } from './market-fixture.mjs';
import { importUSThemePB } from '../scripts/us-theme-valuation-import.mjs';
import { stockcheckURL } from '../scripts/us-theme-valuations.mjs';

const observedAt = '2026-11-08T08:00:00.000Z', now = Date.parse(observedAt);
function input(code, changed = false) {
  const dates = Array.from({ length: 80 }, (_, i) => new Date(Date.parse('2026-11-06') - (79 - i) * 7 * 86400000).toISOString().slice(0, 10));
  const pb = dates.map((_, i) => changed && i === 10 ? 2 : i + 1);
  const data = Object.fromEntries(['3Y', '5Y', '10Y', '20Y'].map(k => [k, { dates, pb }]));
  return { code, observedAt, html: `<link rel="canonical" href="${stockcheckURL(code)}"><span id="val-pb">80</span>截至 2026-11-06 交易日<script>window.__SSG_CHART__ = ${JSON.stringify(data)};</script>` };
}
test('controlled theme import backs up and atomically publishes genuine prepared dates, while unchanged inputs do not write', async () => {
  const f = memoryDB(), dir = await mkdtemp(join(tmpdir(), 'theme-import-')), backup = join(dir, 'before.json');
  try {
    const inputs = [input('SOX'), input('SPX')];
    assert.equal((await importUSThemePB({ db: f.db, inputs, now })).writes, 0);
    assert.equal(f.stats.writes, 0);
    const result = await importUSThemePB({ db: f.db, inputs, now, dryRun: false, backup });
    assert.equal(result.writes, 2); assert.equal(f.stats.writes, 1);
    assert.equal(JSON.parse(await readFile(backup, 'utf8')).length, 2);
    const row = JSON.parse(f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/theme/SOX').payload);
    assert.equal(row.history['2026-11-06'].pb.percentile, 100);
    assert.equal(row.history['2026-11-05'], undefined);
    const changedRetrieval = inputs.map(r => ({ ...r, observedAt: '2026-11-08T09:00:00.000Z', html: r.html + '<!-- fresh page nonce -->' }));
    assert.equal((await importUSThemePB({ db: f.db, inputs: changedRetrieval, now: now + 3600000, dryRun: false })).writes, 0);
    assert.equal(f.stats.writes, 1);
    await assert.rejects(importUSThemePB({ db: f.db, inputs: [input('SOX', true)], now }), /explicit repair/);
    await assert.rejects(importUSThemePB({ db: f.db, inputs, now: now - 1 }), /Future/);
    assert.equal(f.stats.writes, 1);
  } finally { f.close(); await unlink(backup).catch(() => {}); await rmdir(dir); }
});
test('a bad second source cannot publish the first, and a missing backup cannot write', async () => {
  const f = memoryDB();
  try {
    const bad = input('SPX'); bad.html = input('SOX').html;
    await assert.rejects(importUSThemePB({ db: f.db, inputs: [input('SOX'), bad], now, dryRun: false }), /identity/);
    await assert.rejects(importUSThemePB({ db: f.db, inputs: [input('SOX')], now, dryRun: false }), /backup/);
    assert.equal(f.stats.writes, 0); assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM market_snapshot').get().n, 0);
  } finally { f.close(); }
});
