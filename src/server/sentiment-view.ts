import type { Market } from '../market-types';
import { DEFAULT_SENTIMENT_SOURCE, SENTIMENT_SOURCES } from '../lib/sentiment-sources';
interface View {
    json: string;
    revision: string;
}
/** Bounded native D1 projection. No JS loop/validation/serialization of every
 * dated score on cold readers; schema and source-specific writer validate rows. */
const memory = new WeakMap<D1Database, Map<string, {
    value: View;
    at: number;
}>>(), pending = new WeakMap<D1Database, Map<string, Promise<View>>>(), failed = new WeakMap<D1Database, Map<string, number>>();
export async function sentimentView(db: D1Database | undefined, market: Market, to: string): Promise<View> {
    const source = DEFAULT_SENTIMENT_SOURCE[market], info = SENTIMENT_SOURCES[source], meta = JSON.stringify({ source: { name: info.name, url: info.url }, description: info.description });
    const unavailable = { json: meta.slice(0, -1) + ',"observations":[],"error":"贪恐数据暂不可用。"}', revision: 'unavailable' };
    if (!db)
        return unavailable;
    const from = new Date(Date.parse(to) - 371 * 86400000).toISOString().slice(0, 10), key = `${market}/${from}/${to}`, saved = memory.get(db) ?? new Map(), requests = pending.get(db) ?? new Map(), errors = failed.get(db) ?? new Map();
    memory.set(db, saved);
    pending.set(db, requests);
    failed.set(db, errors);
    const hit = saved.get(key), now = Date.now();
    if (hit && now >= hit.at && now - hit.at < 300000)
        return hit.value;
    if ((errors.get(key) ?? 0) > now)
        return hit && now - hit.at < 604800000 ? hit.value : unavailable;
    if (requests.has(key))
        return requests.get(key)!;
    if (requests.size >= 8)
        return unavailable;
    const task = (async () => {
        const report = SENTIMENT_SOURCES.cnn_benzinga;
        const sql = `WITH dated AS (SELECT source,date,score,updated_at,LAG(score) OVER(PARTITION BY source ORDER BY date) AS previous FROM sentiment_daily WHERE market=? AND source IN (?,?) AND date>=? AND date<=? ORDER BY source,date LIMIT 745)
SELECT source,COUNT(*) AS count,MAX(updated_at) AS revision,json_group_array(json(CASE WHEN source='cnn_benzinga' THEN json_object('date',date,'value',score,'previous',NULL,'source',json_object('name',?,'url',?)) ELSE json_object('date',date,'value',score,'previous',previous) END)) AS observations FROM dated GROUP BY source`;
        const r = await db.prepare(sql).bind(market, source, market === 'US' ? 'cnn_benzinga' : source, from, to, report.name, report.url).all<{
            source: string;
            count: number;
            revision: string;
            observations: string;
        }>();
        if (!r.success || r.results.length > 2)
            throw Error('Sentiment view failed');
        let primary = '[]', reported = '', revision = 'empty';
        for (const row of r.results) {
            if (![source, 'cnn_benzinga'].includes(row.source) || row.count > 372 || typeof row.observations !== 'string' || row.observations.length > 80000 || row.observations[0] !== '[' || row.observations.at(-1) !== ']' || !Number.isFinite(Date.parse(row.revision)))
                throw Error('Invalid bounded sentiment view');
            if (row.source === source)
                primary = row.observations;
            else
                reported = row.observations;
            if (row.revision > revision || revision === 'empty')
                revision = row.revision;
        }
        const value = Object.freeze({ json: meta.slice(0, -1) + ',"observations":' + primary + (reported ? ',"reportedObservations":' + reported : '') + '}', revision });
        errors.delete(key);
        if (saved.size >= 32 && !saved.has(key))
            saved.delete(saved.keys().next().value!);
        saved.set(key, { value, at: now });
        return value;
    })().catch(() => { if (errors.size >= 32)
        errors.delete(errors.keys().next().value!); errors.set(key, Date.now() + 60000); return hit && Date.now() - hit.at < 604800000 ? hit.value : unavailable; }).finally(() => requests.delete(key));
    requests.set(key, task);
    return task;
}
