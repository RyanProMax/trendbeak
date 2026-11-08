import proof from '../../data/us-etf-verified-publication.json';
import { validETFValuation, US_SECTOR_ETFS } from '../lib/us-etf-valuations';
export const MAX_ETF_PUBLICATION_ENTRIES = 451, MAX_ETF_PUBLICATION_BYTES = 2000000, MAX_ETF_REQUEST_PROOF_BYTES = 65536;
export type ETFPublicationEntry = { code: string; date: string; version: string; payloadSha256: string; preparedReading: string };
/** Full checkpoint SHA was checked by the controlled read-back tool. Readers bind
 * only this immutable release's exact bounded reading and actual row version. */
export function publicationEntries(value: unknown): ETFPublicationEntry[] {
  const p = value as { schema?: string; entries?: ETFPublicationEntry[]; auditSha256?: string; bundleSha256?: string; verifiedAt?: string };
  if (!p || p.schema !== 'verified-etf-publication-v1' || !Array.isArray(p.entries) || p.entries.length > MAX_ETF_PUBLICATION_ENTRIES) return [];
  if (p.entries.length === 0) return [];
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const instant = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  if (!hash(p.auditSha256) || !hash(p.bundleSha256) || !instant(p.verifiedAt)) return [];
  try {
    if (p.entries.some(e => !e) || new Set(p.entries.map(e => e.code + '/' + e.date)).size !== p.entries.length) return [];
    const perFund = new Map<string, { count: number; version: string; hash: string; method: string; definition?: string }>();
    for (const e of p.entries) {
      if (!e || !hash(e.payloadSha256) || !instant(e.version) || Date.parse(e.version) > Date.parse(p.verifiedAt!) || typeof e.preparedReading !== 'string' || new TextEncoder().encode(e.preparedReading).byteLength > 4096) return [];
      if (Object.keys(e).some(k => !['code','date','version','payloadSha256','preparedReading'].includes(k))) return [];
      const prior = perFund.get(e.code);
      if (prior && (prior.version !== e.version || prior.hash !== e.payloadSha256 || prior.count >= 41)) return [];
      const row = JSON.parse(e.preparedReading);
      if (row.methodVersion === 'xlp_class_conversion_value_v1') return [];
      if (row.code !== e.code || row.date !== e.date || row.pricingBasis !== 'portfolio_fair_value_per_share' || !validETFValuation(row, row.availableDate) || Date.parse(row.availableAt) > Date.parse(p.verifiedAt!)) return [];
      if (prior && (prior.method !== row.methodVersion || prior.definition !== row.revenueDefinition)) return [];
      perFund.set(e.code, { count: (prior?.count ?? 0) + 1, version: e.version, hash: e.payloadSha256, method: row.methodVersion, definition: row.revenueDefinition });
    }
    if (new TextEncoder().encode(JSON.stringify(p.entries)).byteLength > MAX_ETF_PUBLICATION_BYTES) return [];
    return p.entries;
  } catch { return []; }
}
export const VERIFIED_ETF_PUBLICATIONS = publicationEntries(proof);

type IndexedProof = { entry: ETFPublicationEntry; availableDate: string };
function indexPublications(entries: readonly ETFPublicationEntry[]) {
  if (entries.length > MAX_ETF_PUBLICATION_ENTRIES) throw Error('Publication entry bound');
  const index = new Map<string, IndexedProof[]>();
  for (const entry of entries) {
    if (!US_SECTOR_ETFS.some(([code]) => code === entry.code)) continue;
    const rows = index.get(entry.code) ?? [];
    if (rows.length >= 41) throw Error('Publication quarter bound');
    rows.push({ entry, availableDate: JSON.parse(entry.preparedReading).availableDate }); index.set(entry.code, rows);
  }
  for (const rows of index.values()) rows.sort((a,b) => b.entry.date.localeCompare(a.entry.date));
  return index;
}
// Immutable release metadata is indexed once. Requests inspect at most 41 tiny
// date records per fund, never reparse the full manifest or send it to D1.
const defaultIndex = indexPublications(VERIFIED_ETF_PUBLICATIONS), selectedCache = new Map<string,string>();
export function publicationProofsForDate(date: string, entries: readonly ETFPublicationEntry[] = VERIFIED_ETF_PUBLICATIONS): string {
  const cached = entries === VERIFIED_ETF_PUBLICATIONS ? selectedCache.get(date) : undefined;
  if (cached !== undefined) return cached;
  const index = entries === VERIFIED_ETF_PUBLICATIONS ? defaultIndex : indexPublications(entries), selected: ETFPublicationEntry[] = [];
  for (const rows of index.values()) {
    const match = rows.find(r => r.entry.date <= date && r.availableDate <= date);
    if (match) selected.push(match.entry);
  }
  const result = JSON.stringify(selected);
  if (selected.length > 11 || new TextEncoder().encode(result).byteLength > MAX_ETF_REQUEST_PROOF_BYTES) throw Error('Request publication proof bound');
  if (entries === VERIFIED_ETF_PUBLICATIONS) { selectedCache.set(date,result); while (selectedCache.size > 32) selectedCache.delete(selectedCache.keys().next().value!); }
  return result;
}
