import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import { memoryDB } from './market-fixture.mjs';

let vite, respond, valid;
const date = '2026-11-06';
const reading = () => ({ name: '半导体', code: 'SOX', date,
  pb: { value: 8, percentile: 0, samples: 100, from: '2026-01-02', through: '2026-11-05' },
  ps: { value: 5, percentile: 100, samples: 100, from: '2026-01-02', through: '2026-11-05' } });
const payload = row => JSON.stringify({ source: 'stockcheck_index_pb', code: 'SOX', method: 'prior-ten-years-midrank-v1', history: { [date]: row } });
before(async () => {
  vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  respond = (await vite.ssrLoadModule('/src/server/us-theme-valuation-response.ts')).usThemeValuationResponse;
  valid = (await vite.ssrLoadModule('/src/lib/us-theme-valuations.ts')).validUSThemeValuation;
});
after(async () => vite?.close());

test('US themes project one exact date, isolate legacy ETF values, and preserve genuine 0/100 ranks', async () => {
  const f = memoryDB();
  try {
    f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/theme/SOX', payload(reading()), date);
    f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK', payload({ ...reading(), code: 'XLK' }), date);
    const response = await respond(new URL('https://test/api/valuations/US/themes?date=' + date), f.db);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.rows, [reading()]);
    assert.equal(f.stats.reads, 1); assert.equal(f.stats.writes, 0);
    assert.match(f.stats.sql[0], /LIMIT 3/); assert.doesNotMatch(f.stats.sql[0], /SELECT payload|json_each/);
    const missing = await respond(new URL('https://test/api/valuations/US/themes?date=2026-11-05'), f.db);
    assert.deepEqual((await missing.json()).data.rows, []);
  } finally { f.close(); }
});

test('reject mislabeled themes, stale dates, future coverage, and unsupported percentile values', async () => {
  const f = memoryDB();
  try {
    for (const mutate of [
      r => r.code = 'XLK', r => r.name = '信息技术', r => r.date = '2026-11-05',
      r => r.date = '2026-11-07', r => r.pb.samples = 59, r => r.pb.value = null,
      r => r.pb.through = date, r => r.pb.from = '2010-01-01', r => r.pb.percentile = 101,
      r => r.ps.samples = 1000, r => delete r.ps.from,
    ]) {
      const row = reading(); mutate(row);
      f.sqlite.prepare('INSERT OR REPLACE INTO market_snapshot VALUES(?,?,?)').run('valuation/US/theme/SOX', payload(row), date);
      assert.equal((await respond(new URL('https://test/api/valuations/US/themes?date=' + date), f.db)).status, 503);
    }
    const reads = f.stats.reads;
    for (const d of ['2026-02-30', 'bad', '2026-11-06%22']) assert.equal((await respond(new URL('https://test/api/valuations/US/themes?date=' + d), f.db)).status, 400);
    assert.equal(f.stats.reads, reads);
  } finally { f.close(); }
});

test('a real multiple with insufficient history remains unranked, and missing is not zero', () => {
  const row = reading(); row.pb = { value: 8, percentile: null, samples: 0 }; row.ps = { value: null, percentile: null, samples: 0 };
  assert.equal(valid(row, date), true);
  row.pb.percentile = 0; assert.equal(valid(row, date), false);
  row.pb.percentile = null; row.ps.value = 0; assert.equal(valid(row, date), false);
});
