import officialPolicy from '../../data/us-theme-official-sources.json';
import { US_THEME_METHOD, validValuationDate, validUSThemeValuation, type USThemeValuation } from '../lib/us-theme-valuations';

// Expanding the displayed index catalog does not admit new valuation sources.
const PREPARED_CODES = ['SOX', 'SPX'] as const;
const official = officialPolicy.series.filter(p => p.storageAdmission);
const MAX_READINGS = PREPARED_CODES.length + official.length;
/** Fixed admitted series, one exact prepared date. No source fetches or rank rebuilds. */
export async function usThemeValuationResponse(url: URL, db?: D1Database): Promise<Response> {
  const date = url.searchParams.get('date') ?? '';
  if (!validValuationDate(date)) return Response.json({ error: '日期无效' }, { status: 400 });
  if (!db) return Response.json({ error: '估值数据暂不可用' }, { status: 503 });
  try {
    const path = `$.history."${date}"`;
    const result = await db.prepare(`SELECT key, CASE WHEN length(CAST(json_extract(payload, ?) AS BLOB))<=4096 THEN json_extract(payload, ?) ELSE NULL END AS reading
      FROM market_snapshot WHERE ((key IN (${PREPARED_CODES.map(() => '?').join(',')}) AND json_extract(payload,'$.source')='stockcheck_index_pb' AND json_extract(payload,'$.code') IN ('SOX','SPX'))
      ${official.map(() => "OR (key=? AND json_extract(payload,'$.source')=? AND json_extract(payload,'$.seriesId')=? AND json_extract(payload,'$.reviewSha256')=? AND length(CAST(payload AS BLOB))<=32768)").join(' ')})
      AND json_extract(payload,'$.method')=?
      AND key='valuation/US/theme/' || json_extract(payload,'$.code') LIMIT ${MAX_READINGS}`)
      .bind(path, path, ...PREPARED_CODES.map(code => 'valuation/US/theme/' + code), ...official.flatMap(p => ['valuation/US/theme/' + p.code,p.source,p.seriesId,p.reviewSha256]), US_THEME_METHOD)
      .all<{ key: string; reading: string | null }>();
    if (!result.success || result.results.length > MAX_READINGS) throw Error('Theme valuation projection failed');
    const rows: USThemeValuation[] = [];
    const sourceMetadata: Record<string, unknown> = {};
    for (const entry of result.results) {
      if (!entry.reading) continue;
      const row = JSON.parse(entry.reading);
      if (!validUSThemeValuation(row, date) || entry.key !== 'valuation/US/theme/' + row.code || rows.some(r => r.code === row.code)) throw Error('Invalid prepared theme valuation');
      const p = official.find(p => p.code === row.code);
      if (p) {
        const info = row.provenance, source = p.sources.find(s => s.sha256 === info?.sourceDigest && s.url === info?.url && s.vintage === info?.sourceVintage);
        if (!source || !info || info.source !== p.source || info.seriesId !== p.seriesId || info.pointInTime !== false || info.precisionDecimals !== p.precisionDecimals
          || !source.values.some(v => v[0] === date && v[1] === row.pb.value && v[2] === row.ps.value)
          || row.pb.percentile !== null || row.ps.percentile !== null) throw Error('Invalid official source reading');
        sourceMetadata[row.code] = info;
      }
      rows.push(row);
    }
    const provenance = Object.fromEntries(rows.map(row => [row.code, sourceMetadata[row.code] ?? {
      publisher: '股查查', url: `https://www.getstockcheck.com/zh/index/${row.code}.GI/`,
      series: 'published_pb_observations', method: US_THEME_METHOD,
    }]));
    return Response.json({ data: { date, rows, provenance } }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
  } catch {
    return Response.json({ error: '估值数据暂不可用' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
