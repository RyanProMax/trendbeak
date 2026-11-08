import { VERIFIED_ETF_PUBLICATIONS, VERIFIED_ETF_PUBLICATIONS_JSON, type ETFPublicationEntry } from './us-etf-publication';
import { US_SECTOR_ETFS, validETFDate, validETFValuation, type ETFValuation } from '../lib/us-etf-valuations';
/** Fixed symbols, one exact date, <= 4 KB per prepared reading. Never a source fetch. */
export async function usETFValuationResponse(url: URL, db?: D1Database, approved: readonly ETFPublicationEntry[] = VERIFIED_ETF_PUBLICATIONS): Promise<Response> {
  const date = url.searchParams.get('date') ?? '';
  const format = url.searchParams.get('format');
  if (format !== null && !['event-equity-v2', 'audited-events-v3', 'quarterly-history-v4'].includes(format)) return Response.json({ error: '估值格式无效' }, { status: 400 });
  if (!validETFDate(date)) return Response.json({ error: '日期无效' }, { status: 400 });
  if (!db) return Response.json({ error: '估值数据暂不可用' }, { status: 503 });
  try {
    // JSON iteration is capped at 366 actual observations for each of eleven keys.
    // Daily readings are exact-date; quarterly marks are visible only after release.
    // Legacy clients reject the new XLE/XLB event flags. Preserve their other rows and
    // withhold only the event-based values they cannot label accurately.
    const newShareEvents = `WHEN json_extract(reading,'$.code') IN ('XLK','XLY') AND json_extract(reading,'$.qualityFlags.eventReconstructedShares')>0 THEN json_remove(json_set(reading,'$.pb.value',NULL,'$.ps.value',NULL,'$.qualityFlags.eventReconstructedShares',0),'$.sourceComparison')`;
    const legacyEvents = `WHEN json_extract(reading,'$.code')='XLE' AND json_extract(reading,'$.qualityFlags.eventProForma')=1 THEN json_remove(json_set(reading,'$.pb.value',NULL,'$.ps.value',NULL,'$.qualityFlags.eventProForma',0),'$.sourceComparison') WHEN json_extract(reading,'$.code')='XLB' AND json_extract(reading,'$.qualityFlags.eventReconstructedShares')=1 THEN json_remove(json_set(reading,'$.pb.value',NULL,'$.ps.value',NULL,'$.qualityFlags.eventReconstructedShares',0),'$.sourceComparison')`;
    const eventsCompatible = ['audited-events-v3', 'quarterly-history-v4'].includes(format ?? '') ? 'reading' : `CASE ${format === 'event-equity-v2' ? '' : legacyEvents} ${newShareEvents} ELSE reading END`;
    const compatible = format === 'quarterly-history-v4' ? eventsCompatible : `CASE WHEN json_type(reading,'$.ps.quarterlyHistory')='object' THEN json_remove(json_set(${eventsCompatible},'$.pb.percentile',NULL,'$.ps.percentile',NULL),'$.pb.quarterlyHistory','$.ps.quarterlyHistory') ELSE ${eventsCompatible} END`;
    // Temporary reversible output hold while material corporate actions are reviewed.
    // Stored observations remain intact; both client formats suppress alternatives too.
    const corporateHold = format === 'quarterly-history-v4' ? `CASE WHEN released=0 THEN json_remove(json_set(reading,'$.pb.value',NULL,'$.ps.value',NULL,'$.pb.percentile',NULL,'$.ps.percentile',NULL),'$.sourceComparison','$.pb.quarterlyHistory','$.ps.quarterlyHistory') ELSE reading END` : `CASE WHEN json_extract(reading,'$.code') IN ('XLE','XLB','XLK','XLY','XLF') AND released=0 THEN json_remove(json_set(${compatible},'$.pb.value',NULL,'$.ps.value',NULL,'$.pb.percentile',NULL,'$.ps.percentile',NULL),'$.sourceComparison') ELSE ${compatible} END`;
    // Common-equity proof is under review across all funds. Keep the independent PS
    // reading and its comparison unchanged; never expose PB through an alternate.
    const projection = `CASE WHEN released=1 THEN reading WHEN json_type(reading,'$.sourceComparison')='object' THEN json_set(reading,'$.pb.value',NULL,'$.pb.percentile',NULL,'$.sourceComparison.alternateSourceValues.pb',NULL,'$.sourceComparison.deltaPercent.pb',NULL) ELSE json_set(reading,'$.pb.value',NULL,'$.pb.percentile',NULL) END`;
    if (approved.length > 55) throw Error('Publication proof bound');
    const releaseJSON = approved === VERIFIED_ETF_PUBLICATIONS ? VERIFIED_ETF_PUBLICATIONS_JSON : JSON.stringify(approved);
    if (approved !== VERIFIED_ETF_PUBLICATIONS && new TextEncoder().encode(releaseJSON).byteLength > 250000) throw Error('Publication proof byte bound');
    // One JSON binding keeps all dated proofs below D1's 100-parameter limit.
    const releaseValues = `SELECT 'valuation/US/'||json_extract(value,'$.code'),json_extract(value,'$.version'),json_extract(value,'$.preparedReading') FROM json_each(?) LIMIT 55`;
    const result = await db.prepare(`WITH releases(key,version,reading) AS (${releaseValues}) SELECT key, observation_date, ${projection} AS reading FROM (
      SELECT key, observation_date, released, ${corporateHold} AS reading FROM (
      SELECT s.key, h.key AS observation_date, h.value AS reading, EXISTS(SELECT 1 FROM releases r WHERE r.key=s.key AND r.version=s.updated_at AND r.reading=h.value) AS released, ROW_NUMBER() OVER (PARTITION BY s.key ORDER BY h.key DESC) AS position
      FROM market_snapshot s, json_each(s.payload,'$.history') h
      WHERE s.key IN (${US_SECTOR_ETFS.map(() => '?').join(',')}) AND json_extract(s.payload,'$.source')='self_us_etf'
      AND (SELECT COUNT(*) FROM json_each(s.payload,'$.history'))<=366
      AND ${format === 'quarterly-history-v4' ? '1' : "h.key>='2026-06-30'"}
      AND h.key<=? AND json_extract(h.value,'$.availableDate')<=?
      AND (json_extract(h.value,'$.pricingBasis')='portfolio_fair_value_per_share' OR h.key=?)
      ) WHERE position=1 AND length(CAST(reading AS BLOB))<=4096
    ) LIMIT 11`).bind(releaseJSON, ...US_SECTOR_ETFS.map(([code]) => 'valuation/US/' + code), date, date, date).all<{ key: string; observation_date: string; reading: string | null }>();
    if (!result.success || result.results.length > 11) throw Error('ETF valuation projection failed');
    const rows: ETFValuation[] = [];
    for (const entry of result.results) {
      if (!entry.reading) continue;
      const row = JSON.parse(entry.reading);
      if (entry.observation_date !== row.date || entry.key !== 'valuation/US/' + row.code || !validETFValuation(row, date) || rows.some(r => r.code === row.code)) throw Error('Invalid prepared ETF valuation');
      rows.push(row);
    }
    return Response.json({ data: { date, rows } }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
  } catch { return Response.json({ error: '估值数据暂不可用' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
