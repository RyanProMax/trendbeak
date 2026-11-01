import type { Market, MarketSnapshot } from "../market-types";
import { SNAPSHOT_SCHEMA, FRESH_MS, MAX_SNAPSHOT_AGE_MS, readSnapshot, snapshotKey, validRecord, type SnapshotRecord } from "../lib/snapshot-record";

export interface SnapshotEdgeCache { match(key: Request): Promise<Response | undefined>; put(key: Request, response: Response): Promise<unknown> }
export const FAILURE_BACKOFF_MS = 60_000;
/** Per-isolate singleflight; the edge last-good body survives an isolate restart, best effort in this colo only. */
export function createSnapshotCache(clock = Date.now, compactOnly = false) {
  const external = (value:any,market:Market,symbol:string,now:number):value is SnapshotRecord => (!compactOnly || Array.isArray(value?.snapshot?.bars)) && validRecord(value,market,symbol,now);
  const fresh = new Map<string, SnapshotRecord>(), lastGood = new Map<string, SnapshotRecord>();
  const freeze = <T>(v:T):T => { if(v && typeof v==='object' && !Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v; };
  const trusted = (v:SnapshotRecord|undefined,now:number):v is SnapshotRecord => !!v && now>=Date.parse(v.storedAt) && now-Date.parse(v.storedAt)<MAX_SNAPSHOT_AGE_MS && now-Date.parse(v.snapshot.fetchedAt)<MAX_SNAPSHOT_AGE_MS;
  const pending = new Map<string, Promise<MarketSnapshot>>(), failures = new Map<string, { until: number; error: unknown }>();
  const bound = <T>(map: Map<string,T>, key: string, value: T) => { if(map.size >= 64 && !map.has(key)) map.delete(map.keys().next().value!); map.set(key,value); };
  return {
    async peek(market:Market,symbol:string,origin="https://trendbeak.com",edge?:SnapshotEdgeCache):Promise<MarketSnapshot|null>{
      const scope=["https://trendbeak.com","https://trendbeak.pages.dev"].includes(origin)?"https://trendbeak.com":origin,key=`${scope}:${snapshotKey(market,symbol)}`;
      let record=lastGood.get(key);
      if(!trusted(record,clock())){try{const response=await edge?.match(new Request(new URL(`/__snapshot-cache/quote-v2/${encodeURIComponent(snapshotKey(market,symbol))}`,scope)));const body=response?.ok?await response.json():null;if(external(body,market,symbol,clock())){record=freeze(body);bound(lastGood,key,record!);}}catch{/* Health never fetches upstream. */}}
      return trusted(record,clock())?readSnapshot(record,clock(),"memory"):null;
    },
    get(market: Market, symbol: string, load: () => Promise<MarketSnapshot>, origin = "https://trendbeak.com", edge?: SnapshotEdgeCache): Promise<MarketSnapshot> {
      const scope = ["https://trendbeak.com", "https://trendbeak.pages.dev"].includes(origin) ? "https://trendbeak.com" : origin;
      const identity = snapshotKey(market,symbol), key = `${scope}:${identity}`, hit = fresh.get(key), now = clock();
      if (trusted(hit,now) && now - Date.parse(hit.storedAt) < FRESH_MS) return Promise.resolve(readSnapshot(hit,now,"memory"));
      fresh.delete(key);
      if (pending.has(key)) return pending.get(key)!;
      if(pending.size>=8)return Promise.reject(new Error("Quote request budget reached"));
      const task = (async () => {
        let record = lastGood.get(key), via: "memory" | "edge" = "memory";
        if (!trusted(record,clock())) { lastGood.delete(key); record = undefined; }
        const request = new Request(new URL(`/__snapshot-cache/quote-v2/${encodeURIComponent(identity)}`, scope));
        try {
          const response = !record ? await edge?.match(request) : undefined;
          const cached = response?.ok ? await response.json() : undefined;
          if (external(cached,market,symbol,clock()) && (!record || cached.storedAt > record.storedAt)) { record = freeze(cached); via = "edge"; bound(lastGood,key,cached); }
        } catch { /* A cache outage must not disable an otherwise healthy source. */ }
        if(record && clock() - Date.parse(record.storedAt) < FRESH_MS) { bound(fresh,key,record); return readSnapshot(record,clock(),via); }
        const cooldown=new Request(new URL(`/__snapshot-cache/quote-v2/cooldown/${encodeURIComponent(identity)}`,scope));
        try{const response=await edge?.match(cooldown),body=response?.ok?await response.json() as {until:number}:null;if(body&&Number.isFinite(body.until)&&body.until>clock()&&body.until<=clock()+FAILURE_BACKOFF_MS)bound(failures,key,{until:body.until,error:new Error("Quote source cooling down")});}catch{/* Best effort across isolates. */}
        const failure = failures.get(key);
        if (failure && failure.until > clock()) {
          if(record && trusted(record,clock())) return readSnapshot(record,clock(),via,true);
          throw failure.error;
        }
        try {
          const { freshness: _freshness, ...snapshot } = await load();
          const saved: SnapshotRecord = { schema: SNAPSHOT_SCHEMA, storedAt: new Date(clock()).toISOString(), snapshot };
          if(!external(saved,market,symbol,clock())) throw new Error("Invalid successful snapshot");
          freeze(saved);
          // Recheck just before writing: avoid an older slow request replacing a newer observation when visible.
          // Cache API has no atomic compare-and-swap; a cross-isolate race cannot be fully prevented here.
          try {
            const current = await edge?.match(request), body = current?.ok ? await current.json() : null;
            if (external(body,market,symbol,clock()) && body.snapshot.fetchedAt > saved.snapshot.fetchedAt) {
              freeze(body); bound(lastGood,key,body); bound(fresh,key,body); failures.delete(key); return readSnapshot(body,clock(),"edge");
            }
          } catch { /* Best effort only. */ }
          bound(lastGood,key,saved); bound(fresh,key,saved); failures.delete(key);
          try { await edge?.put(request, new Response(JSON.stringify(saved), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${Math.floor(MAX_SNAPSHOT_AGE_MS/1000)}` } })); }
          catch { /* Last-good still remains in memory; cache storage is best effort. */ }
          return readSnapshot(saved,clock(),"upstream");
        } catch(error) {
          bound(failures,key,{ until: clock() + FAILURE_BACKOFF_MS, error });
          try{await edge?.put(cooldown,Response.json({until:clock()+FAILURE_BACKOFF_MS},{headers:{"Cache-Control":`public, max-age=${FAILURE_BACKOFF_MS/1000}`}}));}catch{/* Existing last-good remains intact. */}
          // Never rewrite the body or its timestamp on a failure or cache read.
          if(record && trusted(record,clock())) return readSnapshot(record,clock(),via,true);
          throw error;
        }
      })().finally(()=>pending.delete(key));
      pending.set(key,task);return task;
    },
  };
}
