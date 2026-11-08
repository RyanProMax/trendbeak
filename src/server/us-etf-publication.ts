import proof from '../../data/us-etf-verified-publication.json';
import { validETFValuation } from '../lib/us-etf-valuations';
export type ETFPublicationEntry = { code: string; date: string; version: string; payloadSha256: string; preparedReading: string };
/** Full checkpoint SHA was checked by the controlled read-back tool. Readers bind
 * only this immutable release's exact bounded reading and actual row version. */
export function publicationEntries(value: unknown): ETFPublicationEntry[] {
  const p = value as { schema?: string; entries?: ETFPublicationEntry[]; auditSha256?: string; bundleSha256?: string; verifiedAt?: string };
  if (!p || p.schema !== 'verified-etf-publication-v1' || !Array.isArray(p.entries) || p.entries.length > 11) return [];
  if (p.entries.length === 0) return [];
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const instant = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  if (!hash(p.auditSha256) || !hash(p.bundleSha256) || !instant(p.verifiedAt)) return [];
  try {
    if (p.entries.some(e => !e) || new Set(p.entries.map(e => e.code)).size !== p.entries.length) return [];
    for (const e of p.entries) {
      if (!e || !hash(e.payloadSha256) || !instant(e.version) || Date.parse(e.version) > Date.parse(p.verifiedAt!) || typeof e.preparedReading !== 'string' || new TextEncoder().encode(e.preparedReading).byteLength > 4096) return [];
      const row = JSON.parse(e.preparedReading);
      if (row.code !== e.code || row.date !== e.date || row.pricingBasis !== 'portfolio_fair_value_per_share' || !validETFValuation(row, row.availableDate)) return [];
    }
    return p.entries;
  } catch { return []; }
}
export const VERIFIED_ETF_PUBLICATIONS = publicationEntries(proof);
