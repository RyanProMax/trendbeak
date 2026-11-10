import {assertActiveETFCodes} from './us-etf-retirement.mjs';
// Reviewed local inputs only. This writer never contacts a market-data provider.
import { readFile, writeFile, stat, mkdir, rm } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { calculateETF, valuationMethod, OPERATING_METHOD, OPERATING_REVENUE, SECTORS } from './us-etf-valuations.mjs';
import { connectD1 } from './d1-client.mjs';
import { baseETFReading, withQuarterlyETFHistory } from './us-etf-valuation-history.mjs';
import { provenanceText, compactProvenance, reviewedHistoryInputs } from './us-etf-provenance.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
export const MAX_HISTORY_INPUTS = 44, MAX_INPUT_BYTES = 12_000_000, MAX_OBSERVATIONS = 366;
/** Backfill is explicit, bounded and append-only. It never revises an existing point. */
export async function importETFValuations({ db, inputs, now = Date.now(), dryRun = true, backup, backfill = false, quarterlyHistory = false, expectedCurrentHash, expectedNewHash }) {
  if (typeof backfill !== 'boolean' || !Number.isFinite(now)) throw Error('Invalid import options');
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > (backfill ? MAX_HISTORY_INPUTS : 11)) throw Error(backfill ? 'One to 44 reviewed history inputs required' : 'One to eleven reviewed ETF inputs required');
  assertActiveETFCodes(inputs.map(input=>input?.code));
  if (Buffer.byteLength(JSON.stringify(inputs)) > MAX_INPUT_BYTES) throw Error('Input byte budget exceeded');
  if (quarterlyHistory && (!backfill || !/^[a-f0-9]{64}$/.test(expectedCurrentHash ?? '') || new Set(inputs.map(x => x.code)).size !== 1 || inputs.some(x => !Object.hasOwn(SECTORS, x.code) || x.sourceSeriesId !== 'sec_nport_quarterly'))) throw Error('Explicit reviewed single-fund quarterly history and current checkpoint hash required');
  const groups = new Map(), seen = new Set(), prepared = [], prior = [];
  // Validate the whole incoming batch before reading or preparing any publication.
  for (const input of inputs) {
    const result = calculateETF(input);
    const identity = backfill ? input.code + '/' + input.date : input.code;
    if (seen.has(identity)) throw Error('Duplicate ETF input'); seen.add(identity);
    if (Date.parse(input.cutoff) > now || Date.parse(input.availableAt ?? input.cutoff) > now || Date.parse(input.sourceComparison?.observedAt) > now) throw Error('Future observation');
    if (!groups.has(input.code)) groups.set(input.code, []);
    groups.get(input.code).push({ input, result });
  }
  for (const [code, candidates] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    candidates.sort((a, b) => a.input.date.localeCompare(b.input.date));
    const key = 'valuation/US/' + code;
    const read = await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(key).all();
    if (!read.success || read.results.length > 1) throw Error('ETF checkpoint read failed');
    const row = read.results[0], old = row ? JSON.parse(row.payload) : null;
    if (old && (old.source !== 'self_us_etf' || old.code !== code || valuationMethod(old) !== old.methodVersion || !old.history || !old.latest || !old.latest.quality || !old.latest.input || !old.provenance?.[old.latest.input.date] || Object.keys(old.history).length > MAX_OBSERVATIONS)) throw Error('Invalid ETF checkpoint');
    if (quarterlyHistory && (!row || hash(row.payload) !== expectedCurrentHash)) throw Error('Current ETF checkpoint hash changed before historical preparation');
    const methodVersion = candidates[0].result.reading.methodVersion;
    if (candidates.some(x => x.result.reading.methodVersion !== methodVersion) || old && (old.methodVersion !== methodVersion || Object.values(old.history).some(r => valuationMethod(r) !== methodVersion))) throw Error('Historical append cannot mix valuation methods; explicit reviewed method migration required');
    const hasRanks = !!old?.history?.[old.latest?.input.date]?.ps?.quarterlyHistory;
    if (hasRanks && candidates.some(x => x.input.sourceSeriesId !== 'sec_nport_quarterly')) throw Error('Existing historical source series must remain unchanged');
    const dates = Object.keys(old?.history ?? {}).sort();
    if (old && old.latest.input.date !== dates.at(-1)) throw Error('Latest ETF input does not match history');
    if (!backfill && dates.at(-1) > candidates[0].input.date) throw Error('Older inputs cannot roll back the latest valuation');
    let history = { ...old?.history }; const provenance = { ...old?.provenance };
    let latest = old?.latest;
    for (const { input, result } of candidates) {
      if (history[input.date] && (JSON.stringify(baseETFReading(history[input.date])) !== JSON.stringify(result.reading) || provenanceText(provenance[input.date]) !== JSON.stringify(input.sources))) throw Error('Existing observation differs; explicit reviewed repair required');
      const { sources, ...consumed } = input;
      if (history[input.date]) {
        if (input.date === latest.input.date && (JSON.stringify(latest.input) !== JSON.stringify(consumed) || JSON.stringify(latest.quality) !== JSON.stringify(result.quality))) throw Error('Existing consumed input or quality differs; explicit reviewed repair required');
        continue;
      }
      history[input.date] = result.reading; provenance[input.date] = sources;
      if (!latest || input.date > latest.input.date) latest = { input: consumed, quality: result.quality };
    }
    if (quarterlyHistory || hasRanks) history = withQuarterlyETFHistory(history);
    // Never silently drop old observations to make a backfill fit its budget.
    if (Object.keys(history).length > MAX_OBSERVATIONS) throw Error('ETF observation budget exceeded');
    const ordered = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
    // Revalidate every compressed source on any write, including ordinary appends.
    const checkedProvenance = compactProvenance(provenance);
    const next = { source: 'self_us_etf', code, methodVersion, ...(methodVersion === OPERATING_METHOD ? { revenueDefinition: OPERATING_REVENUE } : {}), history: ordered(history), provenance: ordered(backfill || hasRanks ? checkedProvenance : provenance), latest };
    const payload = JSON.stringify(next);
    if (Buffer.byteLength(payload) > 1_500_000) throw Error('ETF checkpoint exceeds byte budget');
    prior.push({ key, ...(row ?? {}) });
    if (payload !== row?.payload) prepared.push({ key, payload, version: row?.updated_at ?? null, previousPayload: row?.payload ?? null });
  }
  if (quarterlyHistory && !dryRun && prepared.length && (!/^[a-f0-9]{64}$/.test(expectedNewHash ?? '') || prepared.length !== 1 || hash(prepared[0].payload) !== expectedNewHash)) throw Error('Exact reviewed new historical payload hash required');
  return publishPrepared({ db, prepared, prior, now, dryRun, backup });
}
async function publishPrepared({ db, prepared, prior, now, dryRun, backup }) {
  const report = { dryRun, sourceCalls: 0, changedKeys: prepared.map(p => p.key), corrections: prepared.map(p => ({ key: p.key, oldHash: p.previousPayload === null ? null : hash(p.previousPayload), newHash: hash(p.payload) })), checkpointBytes: prepared.reduce((n,p) => n + Buffer.byteLength(p.payload), 0), writes: 0 };
  if (dryRun || !prepared.length) return report;
  if (!backup || !isAbsolute(backup)) throw Error('Private absolute backup required');
  await writeFile(backup, JSON.stringify(prior.filter(r => prepared.some(p => p.key === r.key)).map(r => ({ ...r, publication: report.corrections.find(p => p.key === r.key) }))), { mode: 0o600, flag: 'wx' });
  const stamp = new Date(Math.max(now, ...prior.map(r => r.updated_at ? Date.parse(r.updated_at) + 1 : 0))).toISOString();
  // One guarded statement publishes the entire requested batch or none, including new keys.
  const sql = `WITH incoming(key,payload,version,previous_payload) AS (VALUES ${prepared.map(() => '(?,?,?,?)').join(',')}), approved AS MATERIALIZED (SELECT COUNT(*) AS n FROM incoming i LEFT JOIN market_snapshot s ON s.key=i.key WHERE (i.version IS NULL AND s.key IS NULL) OR (s.updated_at=i.version AND s.payload=i.previous_payload)) INSERT INTO market_snapshot(key,payload,updated_at) SELECT key,payload,? FROM incoming WHERE (SELECT n FROM approved)=? ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`;
  const out = await db.prepare(sql).bind(...prepared.flatMap(p => [p.key, p.payload, p.version, p.previousPayload]), stamp, prepared.length).run();
  if (!out.success || out.meta.changes !== prepared.length) throw Error('Atomic ETF publication not confirmed; inspect state before retry');
  return { ...report, writes: out.meta.changes, publicationVersion: stamp };
}
/** Restore a reviewed pre-backfill checkpoint, only while every changed key still
 * has the exact publication version returned by that backfill. Never overwrite a
 * concurrent update or perform a delete. Current published rows are backed up too.
 */
export async function restoreETFValuations({ db, prior, expectedVersion, now = Date.now(), dryRun = true, backup }) {
  if (!Array.isArray(prior) || !prior.length || prior.length > 11 || !Number.isFinite(now) || typeof expectedVersion !== 'string' || !Number.isFinite(Date.parse(expectedVersion)) || new Date(expectedVersion).toISOString() !== expectedVersion || Date.parse(expectedVersion) > now) throw Error('Explicit prior checkpoints and publication version required');
  assertActiveETFCodes(prior.map(row=>row?.key?.split('/')[2]));
  const prepared = [], current = [], seen = new Set();
  for (const before of prior) {
    const code = before?.key?.split('/')[2];
    if (!before || !Object.hasOwn(SECTORS, code) || seen.has(before.key) || before.key !== 'valuation/US/' + code || typeof before.payload !== 'string' || Buffer.byteLength(before.payload) > 1_500_000) throw Error('Only existing ETF checkpoints can be restored');
    if (!/^[a-f0-9]{64}$/.test(before.publication?.newHash ?? '') || hash(before.payload) !== before.publication?.oldHash) throw Error('Invalid or changed pre-publication backup hash');
    seen.add(before.key);
    const old = JSON.parse(before.payload);
    if (old.source !== 'self_us_etf' || old.code !== code || valuationMethod(old) !== old.methodVersion || !old.history || !old.latest?.input || !old.latest?.quality || !old.provenance?.[old.latest.input.date] || Object.keys(old.history).length > MAX_OBSERVATIONS || Object.keys(old.history).sort().at(-1) !== old.latest.input.date) throw Error('Invalid restore checkpoint');
    compactProvenance(old.provenance);
    const read = await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(before.key).all();
    if (!read.success || read.results.length !== 1 || read.results[0].updated_at !== expectedVersion) throw Error('Published ETF version changed; restore refused');
    const row = read.results[0];
    if (hash(row.payload) !== before.publication.newHash) throw Error('Published ETF payload changed; restore refused');
    current.push({ key: before.key, ...row });
    if (row.payload !== before.payload) prepared.push({ key: before.key, payload: before.payload, version: expectedVersion, previousPayload: row.payload });
  }
  return publishPrepared({ db, prepared, prior: current, now, dryRun, backup });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), option = key => { const i = args.indexOf(key); if (i < 0) return; const value = args[i + 1]; if (!value || value.startsWith('--')) throw Error('Missing ' + key); args.splice(i, 2); return value; };
  const inputSha256 = option('--input-sha256'), gzipSha256 = option('--gzip-sha256'), expandedBytes = Number(option('--expanded-bytes')), expectedNewHash = option('--expected-new-hash');
  const expectedCurrentHash = option('--expected-current-hash'), quarterlyHistory = args.includes('--quarterly-history');
  const file = option('--file'), restore = option('--restore'), expectedVersion = option('--expected-version'), backup = option('--backup'), remote = args.includes('--remote'), dryRun = !args.includes('--write'), backfill = args.includes('--backfill');
  if ((!file === !restore) || restore && (!expectedVersion || backfill) || file && expectedVersion || args.some(a => !['--remote', '--write', '--backfill', '--quarterly-history'].includes(a))) throw Error('Use --file REVIEWED_JSON [--backfill] or --restore PRIVATE_BACKUP --expected-version VERSION, with [--remote] [--write --backup PRIVATE_FILE]');
  if ((await stat(file ?? restore)).size > (restore ? 18_000_000 : MAX_INPUT_BYTES)) throw Error('Input byte budget exceeded');
  const raw = await readFile(file ?? restore);
  const inputs = quarterlyHistory ? reviewedHistoryInputs(raw, {inputSha256, gzipSha256, expandedBytes}) : JSON.parse(raw.toString('utf8')), lock = '/tmp/trendbeak-daily-writer.lock';
  await mkdir(lock, { mode: 0o700 }); let connection;
  try { connection = await connectD1(remote); console.log(JSON.stringify(restore ? await restoreETFValuations({ db: connection.db, prior: inputs, expectedVersion, backup, dryRun }) : await importETFValuations({ db: connection.db, inputs, backup, dryRun, backfill, quarterlyHistory, expectedCurrentHash, expectedNewHash }))); }
  finally { await connection?.close(); await rm(lock, { recursive: true }); }
}
