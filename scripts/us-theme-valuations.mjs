// Explicit bounded backfill from saved public pages; never run by an HTTP reader.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { prepareEfundsHistory } from './efunds-valuations.mjs';

export const THEME_SOURCE = 'stockcheck_index_pb';
export const THEME_METHOD = 'prior-ten-years-midrank-v1';
const NAMES = { SOX: '半导体', SPX: '标普500' };
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const validPB = n => n === null || typeof n === 'number' && Number.isFinite(n) && n > 0;
export function stockcheckURL(code) {
  if (!Object.hasOwn(NAMES, code)) throw Error('Unrecognized published index');
  return `https://www.getstockcheck.com/zh/index/${code}.GI/`;
}

export function parseStockcheckPB(html, code, observedAt) {
  const url = stockcheckURL(code), observed = Date.parse(observedAt);
  if (typeof html !== 'string' || Buffer.byteLength(html) > 262144 || !Number.isFinite(observed)
    || new Date(observed).toISOString() !== observedAt) throw Error('Invalid page size or retrieval timestamp');
  if (!html.includes(`rel="canonical" href="${url}"`)) throw Error('Source index identity mismatch');
  const marker = 'window.__SSG_CHART__ = ';
  const start = html.indexOf(marker), end = html.indexOf(';', start);
  if (start < 0 || end < start || html.indexOf(marker, start + marker.length) !== -1) throw Error('Missing or ambiguous published chart');
  // Parse only the published JSON literal. Never execute a source page's scripts.
  const data = JSON.parse(html.slice(start + marker.length, end));
  const windows = {};
  for (const key of ['3Y', '5Y', '10Y', '20Y']) {
    const series = data[key];
    if (!series || !Array.isArray(series.dates) || !Array.isArray(series.pb) || !series.dates.length
      || series.dates.length > 1100 || series.dates.length !== series.pb.length) throw Error('Invalid published PB series');
    let last = '';
    windows[key] = series.dates.map((date, i) => {
      if (!validDate(date) || date <= last || date > observedAt.slice(0, 10) || !validPB(series.pb[i])) throw Error('Invalid dated PB observation');
      last = date; return [date, series.pb[i], null];
    });
  }
  const rows = windows['20Y'], dates = new Map(rows.map(r => [r[0], r[1]]));
  for (const subset of Object.values(windows)) {
    if (subset.at(-1)[0] !== rows.at(-1)[0]) throw Error('Source windows disagree on latest date');
    for (const [date, value] of subset) if (!dates.has(date) || dates.get(date) !== value) throw Error('Source windows disagree on PB');
  }
  const latest = rows.at(-1), shownPB = /id="val-pb">\s*([\d.]+)\s*</.exec(html)?.[1];
  if (shownPB === undefined || Number(shownPB) !== latest[1] || !html.includes(`截至 ${latest[0]} 交易日`)) throw Error('Published latest value/date mismatch');
  return { source: THEME_SOURCE, code, name: NAMES[code], sourceUrl: url, observedAt,
    sourceDigest: createHash('sha256').update(html).digest('hex'), sourceStart: rows[0][0], rows };
}

export function prepareThemePB(parsed) {
  if (parsed?.source !== THEME_SOURCE || parsed.sourceUrl !== stockcheckURL(parsed.code)
    || parsed.name !== NAMES[parsed.code] || !/^[a-f0-9]{64}$/.test(parsed.sourceDigest ?? '')
    || !Array.isArray(parsed.rows) || !parsed.rows.length || parsed.rows.length > 1100) throw Error('Invalid verified source input');
  let last = '';
  for (const row of parsed.rows) {
    if (!Array.isArray(row) || row.length !== 3 || !validDate(row[0]) || row[0] <= last
      || row[0] > parsed.observedAt.slice(0, 10) || !validPB(row[1]) || row[2] !== null) throw Error('Invalid PB calculation input');
    last = row[0];
  }
  if (parsed.sourceStart !== parsed.rows[0][0]) throw Error('Source history start mismatch');
  // One year of reader dates needs eleven years of source observations. The
  // original publisher's dated points are preserved; missing days stay absent.
  const retainedFrom = new Date(last); retainedFrom.setUTCDate(retainedFrom.getUTCDate() - 364); retainedFrom.setUTCFullYear(retainedFrom.getUTCFullYear() - 10);
  const state = { ...parsed, method: THEME_METHOD, rows: parsed.rows.filter(r => r[0] >= retainedFrom.toISOString().slice(0, 10)) };
  if (state.rows.length > 800) throw Error('PB checkpoint exceeds weekly observation budget');
  // Reuse the CN prior-only, ten-year, half-tie, minimum-60-observation routine.
  prepareEfundsHistory(state);
  for (const row of Object.values(state.history)) {
    if (row.pb.value === null) row.pb = { value: null, percentile: null, samples: 0 };
    else if (!row.pb.samples) row.pb = { value: row.pb.value, percentile: null, samples: 0 };
    row.ps = { value: null, percentile: null, samples: 0 }; // The page publishes PE, not PS.
  }
  if (Object.keys(state.history).length > 366 || Buffer.byteLength(JSON.stringify(state)) > 262144) throw Error('Prepared PB checkpoint budget exceeded');
  return state;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, code, file, out, observedAt, ...extra] = process.argv.slice(2);
  if (mode !== 'backfill' || !file || !out || !observedAt || extra.length) throw Error('Use backfill CODE SAVED_HTML PRIVATE_OUTPUT RETRIEVED_AT_UTC');
  if ((await stat(file)).size > 262144) throw Error('Source byte budget exceeded');
  const state = prepareThemePB(parseStockcheckPB(await readFile(file, 'utf8'), code, observedAt));
  await writeFile(out, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ source: state.source, code, observations: state.rows.length, preparedDates: Object.keys(state.history).length,
    latest: state.history[state.rows.at(-1)[0]], sourceCalls: 0, databaseWrites: 0 }));
}
