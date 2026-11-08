import { US_SECTOR_ETFS, validETFDate, validETFValuation, type ETFValuation } from '../lib/us-etf-valuations';
/** Fixed symbols, one exact date, <= 4 KB per prepared reading. Never a source fetch. */
export async function usETFValuationResponse(url: URL, db?: D1Database): Promise<Response> {
  const date = url.searchParams.get('date') ?? '';
  if (!validETFDate(date)) return Response.json({ error: '日期无效' }, { status: 400 });
  if (!db) return Response.json({ error: '估值数据暂不可用' }, { status: 503 });
  try {
    // JSON iteration is capped at 366 actual observations for each of eleven keys.
    // Daily readings are exact-date; quarterly marks are visible only after release.
    const result = await db.prepare(`SELECT key, observation_date, reading FROM (
      SELECT s.key, h.key AS observation_date, h.value AS reading, ROW_NUMBER() OVER (PARTITION BY s.key ORDER BY h.key DESC) AS position
      FROM market_snapshot s, json_each(s.payload,'$.history') h
      WHERE s.key IN (${US_SECTOR_ETFS.map(() => '?').join(',')}) AND json_extract(s.payload,'$.source')='self_us_etf'
      AND (SELECT COUNT(*) FROM json_each(s.payload,'$.history'))<=366
      AND h.key<=? AND json_extract(h.value,'$.availableDate')<=?
      AND (json_extract(h.value,'$.pricingBasis')='portfolio_fair_value_per_share' OR h.key=?)
    ) WHERE position=1 AND length(CAST(reading AS BLOB))<=4096 LIMIT 11`).bind(...US_SECTOR_ETFS.map(([code]) => 'valuation/US/' + code), date, date, date).all<{ key: string; observation_date: string; reading: string | null }>();
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
