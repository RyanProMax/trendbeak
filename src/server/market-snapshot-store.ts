import type { Market } from "../market-types";
import { FRESH_MS } from "../lib/snapshot-record";
import type { SnapshotEdgeCache } from "./snapshot-cache";
export class SnapshotMissing extends Error {
    constructor() { super("Snapshot has not been prepared"); this.name = "SnapshotMissing"; }
}
export const snapshotKey = (market: Market, symbol: string) => `${market}/${symbol}`;
export interface StoredView {
    key: string;
    payload: string;
    updatedAt: string;
    asOf: string;
    fetchedAt: string;
    sourceUrl: string;
    checksum: string;
}
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
async function cacheText(r: Response) { if (Number(r.headers.get('Content-Length')) > 300000 || !r.body)
    throw Error('Invalid edge body'); const reader = r.body.getReader(), chunks: Uint8Array[] = []; let size = 0; try {
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.length;
        if (size > 300000)
            throw Error('Edge body exceeds budget');
        chunks.push(value);
    }
}
finally {
    await reader.cancel();
} const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
} return new TextDecoder().decode(bytes); }
async function digest(payload: string) { if (typeof payload !== 'string' || payload.length > 300000 || payload[0] !== '{' || payload.at(-1) !== '}')
    throw Error('Invalid view envelope'); const bytes = new TextEncoder().encode(payload); if (bytes.length > 300000)
    throw Error('View exceeds byte budget'); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''); }
/** D1 holds the view fully validated by the controlled writer. Keep its JSON bytes,
 * never parse/scan/re-serialize hundreds of precomputed rows on a reader request.
 * Private edge bodies get metadata and checksum validation once on ingestion.
 * The checksum detects corruption; it is not a signature or authorization token. */
export function createMarketSnapshotStore(clock = Date.now) {
    const memory = new WeakMap<D1Database, Map<string, {
        value: StoredView;
        readAt: number;
    }>>(), pending = new WeakMap<D1Database, Map<string, Promise<StoredView>>>(), failures = new WeakMap<D1Database, Map<string, {
        until: number;
        error: unknown;
    }>>();
    return { async read(db: D1Database | undefined, market: Market, symbol: string, origin = 'https://trendbeak.com', edge?: SnapshotEdgeCache): Promise<StoredView> {
            if (!db)
                throw Error('Market database unavailable');
            const key = snapshotKey(market, symbol), items = memory.get(db) ?? new Map(), requests = pending.get(db) ?? new Map(), errors = failures.get(db) ?? new Map();
            memory.set(db, items);
            pending.set(db, requests);
            failures.set(db, errors);
            const hit = items.get(key), failure = errors.get(key);
            if (failure && failure.until > clock()) {
                if (hit)
                    return hit.value;
                throw failure.error;
            }
            if (hit && clock() >= hit.readAt && clock() - hit.readAt < 300000)
                return hit.value;
            if (requests.has(key))
                return requests.get(key)!;
            if (requests.size >= 8)
                throw Error('Market read budget reached');
            const sourceUrl = market === 'CN' ? `https://gu.qq.com/${symbol.endsWith('.SS') ? 'sh' : 'sz'}${symbol.slice(0, 6)}` : `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`;
            const valid = (v: StoredView) => v.key === key && v.sourceUrl === sourceUrl && timestamp(v.updatedAt) && Date.parse(v.updatedAt) <= clock() && timestamp(v.fetchedAt) && Date.parse(v.fetchedAt) <= clock() && /^\d{4}-\d{2}-\d{2}$/.test(v.asOf) && new Date(v.asOf).toISOString().slice(0, 10) === v.asOf && v.asOf <= new Date(clock() + 86400000).toISOString().slice(0, 10) && /^[a-f0-9]{64}$/.test(v.checksum);
            const remember = (value: StoredView) => { errors.delete(key); Object.freeze(value); if (items.size >= 32 && !items.has(key))
                items.delete(items.keys().next().value!); items.set(key, { value, readAt: clock() }); return value; };
            const task = (async () => {
                const scope = ['https://trendbeak.com', 'https://trendbeak.pages.dev'].includes(origin) ? 'https://trendbeak.com' : origin, request = new Request(new URL('/__market-db/v2/' + encodeURIComponent(key), scope));
                try {
                    const r = await edge?.match(request);
                    if (r?.ok) {
                        const h = r.headers, value = { key: h.get('X-Snapshot-Key')!, updatedAt: h.get('X-Snapshot-Updated')!, asOf: h.get('X-Snapshot-Date')!, fetchedAt: h.get('X-Snapshot-Fetched')!, sourceUrl: h.get('X-Snapshot-Source')!, checksum: h.get('X-Snapshot-Checksum')!, payload: await cacheText(r) };
                        if (h.get('X-Snapshot-Technical') === 'trendbeak_technical_v1' && valid(value) && await digest(value.payload) === value.checksum)
                            return remember(value);
                    }
                }
                catch { /* Authoritative D1 fallback. */ }
                const r = await db.prepare("SELECT json_extract(payload, '$.view') AS payload, json_extract(payload, '$.view.asOf') AS as_of, json_extract(payload, '$.view.fetchedAt') AS fetched_at, json_extract(payload, '$.view.source.url') AS source_url, json_extract(payload, '$.view.technicalSource') AS technical_source, updated_at FROM market_snapshot WHERE key = ?").bind(key).all<{
                    payload: string;
                    as_of: string;
                    fetched_at: string;
                    source_url: string;
                    technical_source: string;
                    updated_at: string;
                }>();
                if (!r.success)
                    throw Error('Market snapshot read failed');
                const row = r.results[0];
                if (!row)
                    throw new SnapshotMissing();
                if (row.technical_source !== 'trendbeak_technical_v1')
                    throw Error('Unvalidated view version');
                const value = { key, payload: row.payload, asOf: row.as_of, fetchedAt: row.fetched_at, sourceUrl: row.source_url, updatedAt: row.updated_at, checksum: await digest(row.payload) };
                if (!valid(value))
                    throw Error('Invalid durable view metadata');
                remember(value);
                try {
                    await edge?.put(request, new Response(value.payload, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=300', 'X-Snapshot-Key': key, 'X-Snapshot-Updated': value.updatedAt, 'X-Snapshot-Date': value.asOf, 'X-Snapshot-Fetched': value.fetchedAt, 'X-Snapshot-Source': sourceUrl, 'X-Snapshot-Checksum': value.checksum, 'X-Snapshot-Technical': 'trendbeak_technical_v1' } }));
                }
                catch { /* Disposable cache. */ }
                return value;
            })().catch(error => { if (errors.size >= 32)
                errors.delete(errors.keys().next().value!); errors.set(key, { until: clock() + 60000, error }); if (hit)
                return hit.value; throw error; }).finally(() => requests.delete(key));
            requests.set(key, task);
            return task;
        } };
}
const store = createMarketSnapshotStore(() => Date.now());
export async function readMarketSnapshot(db: D1Database | undefined, market: Market, symbol: string, origin?: string) { const edge = typeof caches === 'undefined' ? undefined : (caches as unknown as {
    default?: SnapshotEdgeCache;
}).default, record = await store.read(db, market, symbol, origin, edge), age = Math.max(0, Date.now() - Date.parse(record.fetchedAt)); return { ...record, freshness: { state: age >= FRESH_MS ? 'stale' : 'fresh', storedAt: record.fetchedAt, ageSeconds: Math.floor(age / 1000), freshTtlSeconds: FRESH_MS / 1000, maxAgeSeconds: 604800, via: 'database' } }; }
