import type { Market, MarketSnapshot } from "../market-types";
import { usHistoryChain } from "./us-history-seed";
import { SNAPSHOT_SCHEMA, FRESH_MS, MAX_SNAPSHOT_AGE_MS, readSnapshot, snapshotKey, validRecord, type SnapshotRecord } from "../lib/snapshot-record";

export interface SnapshotEdgeCache { match(key: Request): Promise<Response | undefined>; put(key: Request, response: Response): Promise<unknown> }
export const FAILURE_BACKOFF_MS = 15_000;
/** Per-isolate singleflight; the edge last-good body survives an isolate restart, best effort in this colo only. */
export function createSnapshotCache(clock = Date.now) {
  const fresh = new Map<string, SnapshotRecord>(), lastGood = new Map<string, SnapshotRecord>();
  const pending = new Map<string, Promise<MarketSnapshot>>(), failures = new Map<string, { until: number; error: unknown }>();
  const bound = <T>(map: Map<string,T>, key: string, value: T) => { if(map.size >= 64 && !map.has(key)) map.delete(map.keys().next().value!); map.set(key,value); };
  return {
    get(market: Market, symbol: string, load: () => Promise<MarketSnapshot>, origin = "https://trendbeak.com", edge?: SnapshotEdgeCache): Promise<MarketSnapshot> {
      const scope = ["https://trendbeak.com", "https://trendbeak.pages.dev"].includes(origin) ? "https://trendbeak.com" : origin;
      const identity = snapshotKey(market,symbol), key = `${scope}:${identity}`, hit = fresh.get(key), now = clock();
      if (validRecord(hit,market,symbol,now) && now - Date.parse(hit.storedAt) < FRESH_MS) return Promise.resolve(readSnapshot(hit,now,"memory"));
      fresh.delete(key);
      if (pending.has(key)) return pending.get(key)!;
      const task = (async () => {
        let record = lastGood.get(key), via: "memory" | "edge" = "memory";
        if (!validRecord(record,market,symbol,clock())) { lastGood.delete(key); record = undefined; }
        const request = new Request(new URL(`/__snapshot-cache/${encodeURIComponent(identity)}`, scope));
        try {
          const response = await edge?.match(request);
          const cached = response?.ok ? await response.json() : undefined;
          if (validRecord(cached,market,symbol,clock()) && (!record || cached.storedAt > record.storedAt)) { record = cached; via = "edge"; bound(lastGood,key,cached); }
        } catch { /* A cache outage must not disable an otherwise healthy source. */ }
        if(record && clock() - Date.parse(record.storedAt) < FRESH_MS) { bound(fresh,key,record); return readSnapshot(record,clock(),via); }
        const failure = failures.get(key);
        if (failure && failure.until > clock()) {
          if(record && validRecord(record,market,symbol,clock())) return readSnapshot(record,clock(),via,true);
          throw failure.error;
        }
        try {
          const { freshness: _freshness, ...snapshot } = await load();
          const saved: SnapshotRecord = { schema: SNAPSHOT_SCHEMA, storedAt: new Date(clock()).toISOString(), snapshot };
          if(!validRecord(saved,market,symbol,clock())) throw new Error("Invalid successful snapshot");
          // Carry dated US observations across a cold isolate via the existing
          // same-colo last-good. Quote freshness never refreshes observation time.
          if(market === "US" && record?.snapshot.sentiment && snapshot.sentiment) {
            try { snapshot.sentiment = await usHistoryChain.update(record.snapshot.sentiment,snapshot.sentiment,clock()); }
            catch { /* Optional history must never disable a valid quote. */ }
          }
          // Recheck just before writing: avoid an older slow request replacing a newer observation when visible.
          // Cache API has no atomic compare-and-swap; a cross-isolate race cannot be fully prevented here.
          try {
            const current = await edge?.match(request), body = current?.ok ? await current.json() : null;
            if (validRecord(body,market,symbol,clock()) && body.snapshot.fetchedAt > saved.snapshot.fetchedAt) {
              bound(lastGood,key,body); bound(fresh,key,body); failures.delete(key); return readSnapshot(body,clock(),"edge");
            }
          } catch { /* Best effort only. */ }
          bound(lastGood,key,saved); bound(fresh,key,saved); failures.delete(key);
          try { await edge?.put(request, new Response(JSON.stringify(saved), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${Math.floor(MAX_SNAPSHOT_AGE_MS/1000)}` } })); }
          catch { /* Last-good still remains in memory; cache storage is best effort. */ }
          return readSnapshot(saved,clock(),"upstream");
        } catch(error) {
          bound(failures,key,{ until: clock() + FAILURE_BACKOFF_MS, error });
          // Never rewrite the body or its timestamp on a failure or cache read.
          if(record && validRecord(record,market,symbol,clock())) return readSnapshot(record,clock(),via,true);
          throw error;
        }
      })().finally(()=>pending.delete(key));
      pending.set(key,task);return task;
    },
  };
}
