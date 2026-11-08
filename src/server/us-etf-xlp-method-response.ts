import manifest from '../../data/us-etf-xlp-method-publication.json';
import{validXLPMethodReading}from'../lib/us-etf-xlp-method';import type{ETFValuation}from'../lib/us-etf-valuations';
const KEY='valuation-method/US/XLP/xlp_class_conversion_value_v1';
export type Proof={version:string;verifiedAt:string;payloadSha256:string;preparedReading:string};
const instant=(x:unknown):x is string=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
export function xlpMethodPublication(value:unknown):Proof|null{try{const p=value as {schema:string;entry:Proof},e=p?.entry;if(p?.schema!=='verified-xlp-method-publication-v1'||!e||Object.keys(e).some(k=>!['version','verifiedAt','payloadSha256','preparedReading'].includes(k))||!instant(e.version)||!instant(e.verifiedAt)||e.version>e.verifiedAt||!/^[a-f0-9]{64}$/.test(e.payloadSha256)||typeof e.preparedReading!=='string'||new TextEncoder().encode(e.preparedReading).byteLength>4096)return null;const row=JSON.parse(e.preparedReading);if(!validXLPMethodReading(row,row.availableDate)||Date.parse(row.availableAt)>Date.parse(e.verifiedAt))return null;return e;}catch{return null;}}
const RELEASE=xlpMethodPublication(manifest);
/** Select this method for all v7 XLP dates. Missing proof/data is missing, never
 * a request to substitute the previous method or a future observation. */
export async function xlpMethodForDate(db:D1Database,date:string,proof:Proof|null=RELEASE,now=Date.now()):Promise<ETFValuation|null>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'2026-08-28'||!proof||!Number.isFinite(now)||Date.parse(proof.verifiedAt)>now)return null;
 try{const r=await db.prepare("SELECT json_extract(payload,'$.preparedReading') AS reading FROM market_snapshot WHERE key=? AND updated_at=? AND json_extract(payload,'$.source')='self_us_etf_method_series' AND json_extract(payload,'$.code')='XLP' AND json_extract(payload,'$.methodId')='xlp_class_conversion_value_v1' AND length(CAST(json_extract(payload,'$.preparedReading') AS BLOB))<=4096 AND json_extract(payload,'$.preparedReading')=? LIMIT 1").bind(KEY,proof.version,proof.preparedReading).all<{reading:string}>();if(!r.success||r.results.length!==1)return null;return JSON.parse(r.results[0].reading) as ETFValuation;}catch{return null;}
}
