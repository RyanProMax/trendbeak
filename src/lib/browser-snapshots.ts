import type { Market, MarketSnapshot } from "../market-types";
import { readSnapshot, recordFromSnapshot, snapshotKey, validRecord, type SnapshotRecord } from "./snapshot-record";
import { DEFAULT_SENTIMENT_SOURCE, SENTIMENT_SOURCES } from "./sentiment-sources";
const STORAGE = "trendbeak:last-good:v1";
const MAX_BYTES = 2 * 1024 * 1024;
interface Store { getItem(key: string): string | null; setItem(key: string,value: string): void }
function records(store: Store): unknown[] { try { const value = JSON.parse(store.getItem(STORAGE) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
export function rememberSnapshot(snapshot: MarketSnapshot, store: Store | null, now = Date.now()) {
  if(!store) return;
  if(snapshot.freshness?.state !== "fresh") return;
  const record = recordFromSnapshot(snapshot), { market, symbol } = snapshot.instrument;
  if(!validRecord(record,market,symbol,now)) return;
  try {
    const valid = records(store).filter((v: any): v is SnapshotRecord => validRecord(v,v?.snapshot?.instrument?.market,v?.snapshot?.instrument?.symbol,now));
    const old = valid.find(v => snapshotKey(v.snapshot.instrument.market,v.snapshot.instrument.symbol) === snapshotKey(market,symbol));
    if(old && old.snapshot.fetchedAt >= record.snapshot.fetchedAt) return;
    if(JSON.stringify([record]).length * 2 > MAX_BYTES) return;
    const entries = [record, ...valid.filter(v => snapshotKey(v.snapshot.instrument.market,v.snapshot.instrument.symbol) !== snapshotKey(market,symbol))].slice(0,6);
    while(JSON.stringify(entries).length * 2 > MAX_BYTES) entries.pop();
    store.setItem(STORAGE,JSON.stringify(entries));
  } catch { /* Quota, disabled or private storage never blocks live data. */ }
}
export function restoreSnapshot(market: Market, symbol: string, store: Store | null, now = Date.now()): MarketSnapshot | null {
  if(!store) return null;
  const entries = records(store),index = entries.findIndex(v=>validRecord(v,market,symbol,now));
  if(index < 0) return null;
  const found = entries[index] as SnapshotRecord;
  // LRU order is separate from the immutable acquisition timestamps.
  if(index > 0) try { store.setItem(STORAGE,JSON.stringify([found,...entries.filter((_,i)=>i!==index)])); } catch {}
  const snapshot = readSnapshot(found,now,"browser",true);
  // A legacy quote backup must not reintroduce the previous sentiment provider.
  return snapshot.sentiment?.source.url === SENTIMENT_SOURCES[DEFAULT_SENTIMENT_SOURCE[market]].url
    ? snapshot : { ...snapshot, sentiment: undefined };
}
