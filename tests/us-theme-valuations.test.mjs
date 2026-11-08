import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStockcheckPB, prepareThemePB, stockcheckURL } from '../scripts/us-theme-valuations.mjs';
import { decodeThemeRelease } from '../scripts/us-theme-release-input.mjs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const stamp = '2026-11-08T08:00:00.000Z';
test('manual release preserves reviewed bytes and rejects changed identity, digest, future retrieval and compressed bombs', () => {
  const html = source().html(), now = Date.parse(stamp), pack = text => ({ code: 'SOX', observedAt: stamp,
    compressed: gzipSync(text).toString('base64'), sha256: createHash('sha256').update(text).digest('hex') });
  const good = pack(html);
  assert.deepEqual(decodeThemeRelease(good, now), [{ code: 'SOX', html, observedAt: stamp }]);
  for (const changed of [{ code: 'SPX' }, { code: 'UNKNOWN' }, { sha256: '0'.repeat(64) }, { observedAt: '2026-11-09T08:00:00.000Z' },
    { compressed: 'bad input' }, { compressed: 'A'.repeat(62004) }]) assert.throws(() => decodeThemeRelease({ ...good, ...changed }, now));
  assert.throws(() => decodeThemeRelease(pack('x'.repeat(262145)), now));
});
function source(values = Array.from({ length: 80 }, (_, i) => i + 1), code = 'SOX') {
  const dates = values.map((_, i) => new Date(Date.parse('2026-11-06') - (values.length - 1 - i) * 7 * 86400000).toISOString().slice(0, 10));
  const series = { dates, pb: values, pe: values.map(() => 999) };
  const data = Object.fromEntries(['3Y', '5Y', '10Y', '20Y'].map(k => [k, structuredClone(series)]));
  return { data, html: () => `<link rel="canonical" href="${stockcheckURL(code)}"><span id="val-pb">${values.at(-1)}</span>截至 ${dates.at(-1)} 交易日<script>window.__SSG_CHART__ = ${JSON.stringify(data)};</script>` };
}
test('uses published dates, prior-only CN ranks, and never mistakes PE for PS', () => {
  const input = source(), state = prepareThemePB(parseStockcheckPB(input.html(), 'SOX', stamp));
  const latest = state.history['2026-11-06'];
  assert.equal(latest.pb.percentile, 100); assert.equal(latest.pb.samples, 79);
  assert.equal(latest.pb.through, '2026-10-30'); assert.equal(latest.pb.value, 80);
  assert.deepEqual(latest.ps, { value: null, percentile: null, samples: 0 });
  assert.equal(state.history['2026-11-05'], undefined);
  assert.ok(Object.keys(state.history).length <= 53);
  assert.equal(state.observedAt, stamp); assert.equal(state.source, 'stockcheck_index_pb');
  assert.equal(latest.availableDate, undefined, 'retrieval time does not invent a historical publication time');
});
test('ties get half weight; 59 prior observations remain unranked; missing is not zero', () => {
  for (const [n, rank] of [[60, null], [61, 50]]) {
    const input = source(Array(n).fill(4)), state = prepareThemePB(parseStockcheckPB(input.html(), 'SOX', stamp));
    assert.equal(state.history['2026-11-06'].pb.percentile, rank);
    assert.equal(state.history['2026-11-06'].pb.samples, n - 1);
  }
  const values = Array(80).fill(4); values[0] = null;
  const input = source(values), state = prepareThemePB(parseStockcheckPB(input.html(), 'SOX', stamp));
  assert.equal(state.history['2026-11-06'].pb.samples, 78);
});
test('ambiguous, oversized, mismatched or future source observations stop preparation', () => {
  const input = source();
  assert.throws(() => parseStockcheckPB(input.html(), 'SPX', stamp), /identity/);
  assert.throws(() => parseStockcheckPB(input.html() + 'window.__SSG_CHART__ = {};', 'SOX', stamp), /ambiguous/);
  assert.throws(() => parseStockcheckPB('x'.repeat(262145), 'SOX', stamp), /size/);
  assert.throws(() => parseStockcheckPB(input.html(), 'SOX', '2026-11-05T08:00:00.000Z'), /observation/);
  for (const mutate of [
    d => d['10Y'].pb[0] = 400, d => d['20Y'].dates[1] = d['20Y'].dates[0],
    d => d['20Y'].pb[2] = 0, d => d['20Y'].pb.pop(),
  ]) { const bad = source(); mutate(bad.data); assert.throws(() => parseStockcheckPB(bad.html(), 'SOX', stamp)); }
});
test('current outlier does not change earlier prepared ranks and the ten-year window expires', () => {
  const input = source(Array.from({length: 600}, (_, i) => i + 1));
  const first = prepareThemePB(parseStockcheckPB(input.html(), 'SOX', stamp));
  const changed = source([...Array.from({length: 599}, (_, i) => i + 1), 1]);
  const second = prepareThemePB(parseStockcheckPB(changed.html(), 'SOX', stamp));
  assert.deepEqual(first.history['2026-10-30'], second.history['2026-10-30']);
  assert.equal(second.history['2026-11-06'].pb.percentile, 0);
  assert.ok(second.history['2026-11-06'].pb.from >= '2016-11-06');
  assert.equal(second.history['2026-11-06'].pb.samples, 521);
});
