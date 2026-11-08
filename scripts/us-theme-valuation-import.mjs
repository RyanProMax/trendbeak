// Explicit backfill/repair of two reviewed public index series, never a reader job.
import { readFile, writeFile, stat, mkdir, rmdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { connectD1 } from './d1-client.mjs';
import { parseStockcheckPB, prepareThemePB, THEME_SOURCE, THEME_METHOD } from './us-theme-valuations.mjs';

export async function importUSThemePB({ db, inputs, now = Date.now(), dryRun = true, backup, repair = false }) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 2) throw Error('One or two reviewed source pages required');
  const seen = new Set(), prepared = [], prior = [];
  for (const input of inputs) {
    if (seen.has(input.code)) throw Error('Duplicate index input'); seen.add(input.code);
    if (Date.parse(input.observedAt) > now) throw Error('Future source retrieval timestamp');
    const state = prepareThemePB(parseStockcheckPB(input.html, input.code, input.observedAt));
    const key = 'valuation/US/theme/' + state.code;
    const read = await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(key).all();
    if (!read.success || read.results.length > 1) throw Error('Theme checkpoint read failed');
    const row = read.results[0], old = row ? JSON.parse(row.payload) : null;
    if (old && (old.source !== THEME_SOURCE || old.method !== THEME_METHOD || old.code !== state.code || !Array.isArray(old.rows)
      || !old.rows.length || old.rows.length > 800 || !old.history || Object.keys(old.history).length > 366)) throw Error('Unrecognized theme checkpoint');
    if (old?.rows.at(-1)[0] > state.rows.at(-1)[0]) throw Error('Older input cannot roll back the latest observation');
    const incoming = new Map(state.rows.map(r => [r[0], r]));
    if (old && !repair) for (const r of old.rows) {
      if (r[0] >= state.rows[0][0] && JSON.stringify(incoming.get(r[0])) !== JSON.stringify(r)) throw Error('Historical revision/deletion requires explicit repair');
    }
    // Retrieval time or a changing page nonce must not replace unchanged data.
    if (old && JSON.stringify(old.rows) === JSON.stringify(state.rows) && JSON.stringify(old.history) === JSON.stringify(state.history)) continue;
    prior.push({ key, ...(row ?? {}) });
    prepared.push({ key, payload: JSON.stringify(state), version: row?.updated_at ?? null });
  }
  const report = { dryRun, sourceCalls: 0, changedKeys: prepared.map(r => r.key), writes: 0 };
  if (dryRun || !prepared.length) return report;
  if (!backup || !isAbsolute(backup)) throw Error('Exclusive private backup required');
  await writeFile(backup, JSON.stringify(prior), { mode: 0o600, flag: 'wx' });
  const stamp = new Date(Math.max(now, ...prior.map(r => r.updated_at ? Date.parse(r.updated_at) + 1 : 0))).toISOString();
  const sql = `WITH incoming(key,payload,version) AS (VALUES ${prepared.map(() => '(?,?,?)').join(',')}), approved AS MATERIALIZED
    (SELECT COUNT(*) AS n FROM incoming i LEFT JOIN market_snapshot s ON s.key=i.key WHERE (i.version IS NULL AND s.key IS NULL) OR s.updated_at=i.version)
    INSERT INTO market_snapshot(key,payload,updated_at) SELECT key,payload,? FROM incoming WHERE (SELECT n FROM approved)=?
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`;
  const result = await db.prepare(sql).bind(...prepared.flatMap(r => [r.key, r.payload, r.version]), stamp, prepared.length).run();
  if (!result.success || result.meta.changes !== prepared.length) throw Error('Atomic theme publication not confirmed; inspect before retry');
  return { ...report, writes: result.meta.changes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), option = key => { const i = args.indexOf(key); if (i < 0) return; const value = args[i + 1]; if (!value || value.startsWith('--')) throw Error('Missing ' + key); args.splice(i, 2); return value; };
  const file = option('--file'), backup = option('--backup');
  if (!file || args.some(a => !['--remote', '--write', '--repair'].includes(a))) throw Error('Use --file SAVED_SOURCE_INPUTS_JSON [--remote] [--write --backup ABSOLUTE_PRIVATE_FILE] [--repair]');
  if ((await stat(file)).size > 600000) throw Error('Input byte budget exceeded');
  const inputs = JSON.parse(await readFile(file, 'utf8')), lock = join(tmpdir(), 'trendbeak-daily-writer.lock');
  await mkdir(lock, { mode: 0o700 }); let connection;
  try {
    connection = await connectD1(args.includes('--remote'));
    console.log(JSON.stringify(await importUSThemePB({ db: connection.db, inputs, backup, dryRun: !args.includes('--write'), repair: args.includes('--repair') })));
  } finally { await connection?.close(); await rmdir(lock); }
}
