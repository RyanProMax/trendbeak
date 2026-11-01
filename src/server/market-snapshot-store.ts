import type{Market}from'../market-types';import{FRESH_MS}from'../lib/snapshot-record';import{dailySnapshotCurrent}from'../lib/daily-freshness';
export class SnapshotMissing extends Error{constructor(){super('Snapshot has not been prepared');this.name='SnapshotMissing';}}
export const snapshotKey=(market:Market,symbol:string)=>`${market}/${symbol}`;
interface Version{key:string;updatedAt:string;etag:string}
export interface StoredView extends Version{payload:string;fetchedAt:string;asOf:string;sourceUrl:string;session:'closed'|'trading'}
const timestamp=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const etag=(key:string,updatedAt:string)=>`W/"http-v1:${key}:${updatedAt}"`;
const weak=(tag:string)=>tag.trim().replace(/^W\//,'');
const matches=(header:string|undefined,value:string)=>header?.split(',').some(s=>weak(s)===weak(value)||s.trim()==='*')??false;
const condition="(updated_at=?1 OR ?1='*')",fields={payload:"json_extract(payload,'$.http.body')",bytes:"length(CAST(json_extract(payload,'$.http.body') AS BLOB))",fetched_at:"json_extract(payload,'$.view.fetchedAt')",as_of:"json_extract(payload,'$.view.asOf')",source_url:"json_extract(payload,'$.view.source.url')",technical_source:"json_extract(payload,'$.view.technicalSource')",session:"json_extract(payload,'$.view.session')"};
const responseSQL='SELECT updated_at,'+condition+' AS not_modified,'+Object.entries(fields).map(([alias,field])=>`CASE WHEN ${condition} THEN NULL ELSE ${field} END AS ${alias}`).join(',')+' FROM market_snapshot WHERE key=?2';

/** One prepared body read; conditional hits query ONLY the version column. No
 * sentiment query, body JSON parsing, body validation loop or source fetch. */
export function createMarketSnapshotStore(clock=Date.now){
 const memory=new WeakMap<D1Database,Map<string,{value:Version|StoredView;at:number}>>(),pending=new WeakMap<D1Database,Map<string,Promise<any>>>(),failures=new WeakMap<D1Database,Map<string,{until:number;error:unknown}>>();
 return{async read(db:D1Database|undefined,market:Market,symbol:string,_origin?:string,ifNone?:string):Promise<Version|StoredView>{
  if(!db)throw Error('Market database unavailable');const key=snapshotKey(market,symbol),saved=memory.get(db)??new Map(),requests=pending.get(db)??new Map(),errors=failures.get(db)??new Map();memory.set(db,saved);pending.set(db,requests);failures.set(db,errors);const hit=saved.get(key);
  const remember=(value:Version|StoredView)=>{Object.freeze(value);if(saved.size>=32&&!saved.has(key))saved.delete(saved.keys().next().value!);saved.set(key,{value,at:clock()});errors.delete(key);return value;};
  const versionOnly=(v:Version)=>({key:v.key,updatedAt:v.updatedAt,etag:v.etag});
  if(hit&&clock()>=hit.at&&clock()-hit.at<300000){if(matches(ifNone,hit.value.etag))return versionOnly(hit.value);if('payload'in hit.value)return hit.value;}
  const failed=errors.get(key);if(failed&&failed.until>clock()){if(hit&&'payload'in hit.value)return matches(ifNone,hit.value.etag)?versionOnly(hit.value):hit.value;throw failed.error;}
  const once=<T>(id:string,fn:()=>Promise<T>):Promise<T>=>{if(requests.has(id))return requests.get(id)!;if(requests.size>=8)throw Error('Market read budget reached');const task=fn().finally(()=>requests.delete(id));requests.set(id,task);return task;};
  try{
   const tags=ifNone?.split(',').map(s=>s.trim())??[],prefix=`"http-v1:${key}:`;
   const single=tags.length===1?weak(tags[0]):undefined;
   const expected=single==='*'?'*':single?.startsWith(prefix)&&single.endsWith('"')?single.slice(prefix.length,-1):'';
   if(tags.length>1){const v=await once('version/'+key,async()=>{const r=await db.prepare('SELECT updated_at FROM market_snapshot WHERE key = ?').bind(key).all<{updated_at:string}>();if(!r.success)throw Error('Version read failed');const row=r.results[0];if(!row)throw new SnapshotMissing();return{key,updatedAt:row.updated_at,etag:etag(key,row.updated_at)};});if(matches(ifNone,v.etag)){remember(v);return v;}}
   return await once('body/'+key+'/'+(expected??''),async()=>{    const r=await db.prepare(responseSQL).bind(expected,key).all<{payload:string;bytes:number;fetched_at:string;as_of:string;source_url:string;technical_source:string;session:'closed'|'trading';updated_at:string;not_modified:number}>();if(!r.success)throw Error('Prepared response read failed');const row=r.results[0];if(!row)throw new SnapshotMissing();if(!timestamp(row.updated_at)||Date.parse(row.updated_at)>clock())throw Error('Invalid version');if(row.not_modified){return remember({key,updatedAt:row.updated_at,etag:etag(key,row.updated_at)});}const sourceUrl=market==='CN'?`https://gu.qq.com/${symbol.endsWith('.SS')?'sh':'sz'}${symbol.slice(0,6)}`:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`;
    if(!timestamp(row.updated_at)||Date.parse(row.updated_at)>clock()||!timestamp(row.fetched_at)||Date.parse(row.fetched_at)>clock()||row.source_url!==sourceUrl||row.technical_source!=='trendbeak_technical_v1'||!['closed','trading'].includes(row.session)||!/^\d{4}-\d{2}-\d{2}$/.test(row.as_of)||typeof row.payload!=='string'||!Number.isFinite(row.bytes)||row.bytes<=0||row.bytes>300000||row.payload.length>300000||!row.payload.startsWith('{"data":{')||!row.payload.endsWith('}}'))throw Error('Prepared response unavailable or invalid');return remember({key,payload:row.payload,fetchedAt:row.fetched_at,asOf:row.as_of,session:row.session,sourceUrl,updatedAt:row.updated_at,etag:etag(key,row.updated_at)}) as StoredView;
   });
  }catch(error){if(errors.size>=32)errors.delete(errors.keys().next().value!);errors.set(key,{until:clock()+60000,error});if(hit&&'payload'in hit.value)return matches(ifNone,hit.value.etag)?versionOnly(hit.value):hit.value;throw error;}
 }};
}
const store=createMarketSnapshotStore(()=>Date.now());
export async function readMarketSnapshot(db:D1Database|undefined,market:Market,symbol:string,origin?:string,ifNone?:string){const record=await store.read(db,market,symbol,origin,ifNone);if(!('payload'in record))return{body:null,etag:record.etag};const age=Math.max(0,Date.now()-Date.parse(record.fetchedAt)),freshness={state:dailySnapshotCurrent(market,record.asOf,record.fetchedAt,record.session,Date.now())?'fresh':'stale',storedAt:record.fetchedAt,ageSeconds:Math.floor(age/1000),freshTtlSeconds:FRESH_MS/1000,maxAgeSeconds:604800,via:'database'};return{body:record.payload.slice(0,-2)+',"freshness":'+JSON.stringify(freshness)+'}}',etag:record.etag};}
