import type { Market } from "../market-types";
import { FRESH_MS } from "../lib/snapshot-record";
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
}
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
/** D1 view bytes were fully validated by the controlled writer. The disposable
 * cache is isolate memory only: a cold/evicted instance always performs one
 * indexed D1 read, never CPU-heavy edge revalidation or an upstream fetch. */
export function createMarketSnapshotStore(clock = Date.now) {
    const memory = new WeakMap<D1Database, Map<string, {
        value: StoredView;
        readAt: number;
    }>>(), pending = new WeakMap<D1Database, Map<string, Promise<StoredView>>>(), failures = new WeakMap<D1Database, Map<string, {
        until: number;
        error: unknown;
    }>>();
    return { async read(db: D1Database | undefined, market: Market, symbol: string, origin = 'https://trendbeak.com'): Promise<StoredView> {
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
            const valid = (v: StoredView) => v.key === key && v.sourceUrl === sourceUrl && timestamp(v.updatedAt) && Date.parse(v.updatedAt) <= clock() && timestamp(v.fetchedAt) && Date.parse(v.fetchedAt) <= clock() && /^\d{4}-\d{2}-\d{2}$/.test(v.asOf) && new Date(v.asOf).toISOString().slice(0, 10) === v.asOf && v.asOf <= new Date(clock() + 86400000).toISOString().slice(0, 10);
            const remember = (value: StoredView) => {
                errors.delete(key);
                Object.freeze(value);
                if (items.size >= 32 && !items.has(key))
                    items.delete(items.keys().next().value!);
                items.set(key, { value, readAt: clock() });
                return value;
            };
            const task = (async () => {
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
                const value = { key, payload: row.payload, asOf: row.as_of, fetchedAt: row.fetched_at, sourceUrl: row.source_url, updatedAt: row.updated_at };
                if (!valid(value))
                    throw Error('Invalid durable view metadata');
                if (typeof value.payload !== 'string' || value.payload.length > 300000 || new TextEncoder().encode(value.payload).length > 300000 || value.payload[0] !== '{' || value.payload.at(-1) !== '}')
                    throw Error('View exceeds bounded JSON envelope');
                remember(value);
                return value;
            })().catch(error => {
                if (errors.size >= 32)
                    errors.delete(errors.keys().next().value!);
                errors.set(key, { until: clock() + 60000, error });
                if (hit)
                    return hit.value;
                throw error;
            }).finally(() => requests.delete(key));
            requests.set(key, task);
            return task;
        } };
}
const store = createMarketSnapshotStore(() => Date.now());
export async function readMarketSnapshot(db: D1Database | undefined, market: Market, symbol: string, origin?: string) { const record = await store.read(db, market, symbol, origin), age = Math.max(0, Date.now() - Date.parse(record.fetchedAt)); return { ...record, freshness: { state: age >= FRESH_MS ? 'stale' : 'fresh', storedAt: record.fetchedAt, ageSeconds: Math.floor(age / 1000), freshTtlSeconds: FRESH_MS / 1000, maxAgeSeconds: 604800, via: 'database' } }; }
