import test from 'node:test'; import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
import { memoryDB } from './market-fixture.mjs'; import { etfInput, cutoff } from './us-etf-fixture.mjs'; import { importETFValuations } from '../scripts/us-etf-valuation-import.mjs';
const now = Date.parse(cutoff) + 1000;
test('dry run is read-only; atomic publication backs up; unchanged rerun does not write; gaps stay absent', async () => {
  const f = memoryDB(), dir = await mkdtemp(join(tmpdir(), 'etf-import-'));
  try {
    const inputs = [etfInput(), { ...etfInput(), code: 'XLF' }], options = { db: f.db, inputs, now };
    assert.equal((await importETFValuations(options)).writes, 0); assert.equal(f.stats.writes, 0);
    assert.equal((await importETFValuations({ ...options, dryRun: false, backup: dir + '/backup.json' })).writes, 2);
    assert.equal(f.stats.writes, 1); assert.equal(JSON.parse(await readFile(dir + '/backup.json', 'utf8')).length, 2);
    assert.equal((await importETFValuations({ ...options, dryRun: false })).writes, 0);
    const stored = JSON.parse(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key=?").get("valuation/US/XLK").payload);
    assert.deepEqual(Object.keys(stored.history), ['2026-11-05']); assert.equal(stored.latest.input.holdings.length, 2); assert.equal(stored.provenance['2026-11-05'][0].url,inputs[0].sources[0].url);
    inputs[0].holdings[0].price.value++;
    await assert.rejects(importETFValuations({ ...options, dryRun: false, backup: dir + '/other.json' }), /differs/);
    assert.equal(f.stats.writes, 1);
  } finally { f.close(); await rm(dir, { recursive: true }); }
});
test('concurrent insert blocks the entire batch without partial writes', async () => {
  const f = memoryDB(), dir = await mkdtemp(join(tmpdir(), 'etf-cas-'));
  try {
    const db = { prepare(sql) { const statement = f.db.prepare(sql); return { bind(...values) { const bound = statement.bind(...values); return { ...bound, async run() { f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK', '{}', 'concurrent'); return bound.run(); } }; } }; } };
    await assert.rejects(importETFValuations({ db, inputs: [etfInput(), { ...etfInput(), code: 'XLF' }], now, dryRun: false, backup: dir + '/backup.json' }), /not confirmed/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM market_snapshot').get().n, 1);
    assert.equal(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key=?").get("valuation/US/XLK").payload, '{}');
  } finally { f.close(); await rm(dir, { recursive: true }); }
});
