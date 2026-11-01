import type { Market, MarketSnapshot } from "../market-types";
import { validSnapshot, FRESH_MS } from "../lib/snapshot-record";
import type { SnapshotEdgeCache } from "./snapshot-cache";
export class SnapshotMissing extends Error {
    constructor() { super("Snapshot has not been prepared"); this.name = "SnapshotMissing"; }
}
export const snapshotKey = (market: Market, symbol: string) => `${market}/${symbol}`;
export interface StoredView {
    key: string;
    snapshot: MarketSnapshot;
    updatedAt: string;
}
const freeze = <T>(value: T): T => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
} return value; };
/** Reader has no upstream or calculation callback. Eviction always returns to D1. */
export function createMarketSnapshotStore(clock = Date.now) {
    const cache = new WeakMap<D1Database, Map<string, {
        value: StoredView;
        readAt: number;
    }>>(), pending = new WeakMap<D1Database, Map<string, Promise<StoredView>>>(), failures = new WeakMap<D1Database, Map<string, {
        until: number;
        error: unknown;
    }>>();
    return { async read(db: D1Database | undefined, market: Market, symbol: string, origin = 'https://trendbeak.com', edge?: SnapshotEdgeCache): Promise<StoredView> {
            if (!db)
                throw Error('Market database unavailable');
            const key = snapshotKey(market, symbol), items = cache.get(db) ?? new Map(), requests = pending.get(db) ?? new Map();
            cache.set(db, items);
            pending.set(db, requests);
            const errors = failures.get(db) ?? new Map();
            failures.set(db, errors);
            const failure = errors.get(key);
            if (failure && failure.until > clock()) {
                const saved = items.get(key);
                if (saved)
                    return saved.value;
                throw failure.error;
            }
            const hit = items.get(key);
            if (hit && clock() - hit.readAt >= 0 && clock() - hit.readAt < 300000)
                return hit.value;
            if (requests.has(key))
                return requests.get(key)!;
            if (requests.size >= 8)
                throw Error('Market read budget reached');
            const valid = (v: any): v is StoredView => v?.key === key && Number.isFinite(Date.parse(v.updatedAt)) && Date.parse(v.updatedAt) <= clock() && v.snapshot && v.snapshot.technicalSource === 'trendbeak_technical_v1' && v.snapshot.source?.url === (market === 'CN' ? `https://gu.qq.com/${symbol.endsWith('.SS') ? 'sh' : 'sz'}${symbol.slice(0, 6)}` : `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`) && !v.snapshot.bars && Object.keys(v.snapshot.history ?? {}).length <= 366 && validSnapshot(v.snapshot, market, symbol, clock());
            const remember = (value: StoredView) => { errors.delete(key); freeze(value); if (items.size >= 32 && !items.has(key))
                items.delete(items.keys().next().value!); items.set(key, { value, readAt: clock() }); return value; };
            const task = (async () => {
                const scope = ['https://trendbeak.com', 'https://trendbeak.pages.dev'].includes(origin) ? 'https://trendbeak.com' : origin, request = new Request(new URL('/__market-db/v1/' + encodeURIComponent(key), scope));
                try {
                    const response = await edge?.match(request), value = response?.ok ? await response.json() : null;
                    if (valid(value))
                        return remember(value);
                }
                catch { /* D1 is authoritative. */ }
                const r = await db.prepare("SELECT json_extract(payload, '$.view') AS payload, updated_at FROM market_snapshot WHERE key = ?").bind(key).all<{
                    payload: string;
                    updated_at: string;
                }>();
                if (!r.success)
                    throw Error('Market snapshot read failed');
                const row = r.results[0];
                if (!row)
                    throw new SnapshotMissing();
                if (typeof row.payload !== 'string' || new TextEncoder().encode(row.payload).length > 300000)
                    throw Error('Market view exceeds byte budget');
                const value = { key, snapshot: JSON.parse(row.payload), updatedAt: row.updated_at };
                if (!valid(value))
                    throw Error('Invalid durable market view');
                remember(value);
                try {
                    await edge?.put(request, Response.json(value, { headers: { 'Cache-Control': 'public, max-age=300' } }));
                }
                catch { /* Disposable cache. */ }
                return value;
            })().catch(error => { if (errors.size >= 32)
                errors.delete(errors.keys().next().value!); errors.set(key, { until: clock() + 60000, error }); const old = items.get(key); if (old)
                return old.value; throw error; }).finally(() => requests.delete(key));
            requests.set(key, task);
            return task;
        } };
}
const store = createMarketSnapshotStore(() => Date.now());
export async function readMarketSnapshot(db: D1Database | undefined, market: Market, symbol: string, origin?: string) { const edge = typeof caches === 'undefined' ? undefined : (caches as unknown as {
    default?: SnapshotEdgeCache;
}).default; const record = await store.read(db, market, symbol, origin, edge), now = Date.now(); return { updatedAt: record.updatedAt, snapshot: { ...record.snapshot, freshness: { state: now - Date.parse(record.snapshot.fetchedAt) >= FRESH_MS ? 'stale' as const : 'fresh' as const, storedAt: record.snapshot.fetchedAt, ageSeconds: Math.max(0, Math.floor((now - Date.parse(record.snapshot.fetchedAt)) / 1000)), freshTtlSeconds: FRESH_MS / 1000, maxAgeSeconds: 604800, via: 'database' as const } } }; }
