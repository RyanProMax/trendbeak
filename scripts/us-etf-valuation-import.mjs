// Reviewed local inputs only. This writer never contacts a market-data provider.
import { readFile, writeFile, stat, mkdir, rm } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { calculateETF, METHOD } from './us-etf-valuations.mjs';
import { connectD1 } from './d1-client.mjs';
export async function importETFValuations({ db, inputs, now = Date.now(), dryRun = true, backup }) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 11) throw Error('One to eleven reviewed ETF inputs required');
  const seen = new Set(), prepared = [], prior = [];
  for (const input of inputs) {
    if (seen.has(input.code)) throw Error('Duplicate ETF input'); seen.add(input.code);
    if (Date.parse(input.cutoff) > now || Date.parse(input.availableAt ?? input.cutoff) > now || Date.parse(input.sourceComparison?.observedAt) > now) throw Error('Future observation');
    const result = calculateETF(input), key = 'valuation/US/' + input.code;
    const read = await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(key).all();
    if (!read.success || read.results.length > 1) throw Error('ETF checkpoint read failed');
    const row = read.results[0], old = row ? JSON.parse(row.payload) : null;
    if (old && (old.source !== 'self_us_etf' || old.code !== input.code || old.methodVersion !== METHOD || !old.history || !old.latest || !old.latest.quality || !old.latest.input || !old.provenance?.[old.latest.input.date] || Object.keys(old.history).length > 366)) throw Error('Invalid ETF checkpoint');
    const dates = Object.keys(old?.history ?? {}).sort();
    if (dates.at(-1) > input.date) throw Error('Older inputs cannot roll back the latest valuation');
    if (old?.history[input.date] && JSON.stringify(old.history[input.date]) !== JSON.stringify(result.reading)) throw Error('Existing observation differs; explicit reviewed repair required');
    const history = { ...old?.history, [input.date]: result.reading };
    const provenance = { ...old?.provenance, [input.date]: input.sources };
    // Keep bounded actual observations. Missing sessions are never generated.
    for (const d of Object.keys(history).sort().slice(0, -366)) { delete history[d]; delete provenance[d]; }
    const { sources, ...consumed } = input;
    const next = { source: 'self_us_etf', code: input.code, methodVersion: METHOD, history, provenance, latest: { input: consumed, quality: result.quality } };
    const payload = JSON.stringify(next);
    if (Buffer.byteLength(payload) > 1_500_000) throw Error('ETF checkpoint exceeds byte budget');
    prior.push({ key, ...(row ?? {}) });
    if (payload !== row?.payload) prepared.push({ key, payload, version: row?.updated_at ?? null });
  }
  const report = { dryRun, sourceCalls: 0, changedKeys: prepared.map(p => p.key), checkpointBytes: prepared.reduce((n,p) => n + Buffer.byteLength(p.payload), 0), writes: 0 };
  if (dryRun || !prepared.length) return report;
  if (!backup || !isAbsolute(backup)) throw Error('Private absolute backup required');
  await writeFile(backup, JSON.stringify(prior), { mode: 0o600, flag: 'wx' });
  const stamp = new Date(Math.max(now, ...prior.map(r => r.updated_at ? Date.parse(r.updated_at) + 1 : 0))).toISOString();
  // One guarded statement publishes the entire requested batch or none, including new keys.
  const sql = `WITH incoming(key,payload,version) AS (VALUES ${prepared.map(() => '(?,?,?)').join(',')}), approved AS MATERIALIZED (SELECT COUNT(*) AS n FROM incoming i LEFT JOIN market_snapshot s ON s.key=i.key WHERE (i.version IS NULL AND s.key IS NULL) OR s.updated_at=i.version) INSERT INTO market_snapshot(key,payload,updated_at) SELECT key,payload,? FROM incoming WHERE (SELECT n FROM approved)=? ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`;
  const out = await db.prepare(sql).bind(...prepared.flatMap(p => [p.key, p.payload, p.version]), stamp, prepared.length).run();
  if (!out.success || out.meta.changes !== prepared.length) throw Error('Atomic ETF publication not confirmed; inspect state before retry');
  return { ...report, writes: out.meta.changes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), option = key => { const i = args.indexOf(key); if (i < 0) return; const value = args[i + 1]; if (!value || value.startsWith('--')) throw Error('Missing ' + key); args.splice(i, 2); return value; };
  const file = option('--file'), backup = option('--backup'), remote = args.includes('--remote'), dryRun = !args.includes('--write');
  if (!file || args.some(a => !['--remote', '--write'].includes(a))) throw Error('Use --file REVIEWED_JSON [--remote] [--write --backup PRIVATE_FILE]');
  if ((await stat(file)).size > 12_000_000) throw Error('Input byte budget exceeded');
  const inputs = JSON.parse(await readFile(file, 'utf8')), lock = '/tmp/trendbeak-daily-writer.lock';
  await mkdir(lock, { mode: 0o700 }); let connection;
  try { connection = await connectD1(remote); console.log(JSON.stringify(await importETFValuations({ db: connection.db, inputs, backup, dryRun }))); }
  finally { await connection?.close(); await rm(lock, { recursive: true }); }
}
