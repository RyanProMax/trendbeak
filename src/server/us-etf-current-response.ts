import manifest from '../../data/us-etf-current-publication.json';
import {validCurrentBasket} from '../lib/us-etf-current';
const KEY='current-estimate/US/XLI';
type CurrentProof={version:string;payloadSha256:string;preparedReading:string;verifiedAt:string};
const instant=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
/** Static release validation occurs once, not once per HTTP request. */
export function currentPublication(value:unknown):CurrentProof|null {
 try {
  const p=value as {schema?:string;entry?:CurrentProof};const e=p?.entry;
  if(p?.schema!=='verified-current-basket-publication-v1'||!e||!instant(e.version)||!instant(e.verifiedAt)||e.version>e.verifiedAt||!/^[a-f0-9]{64}$/.test(e.payloadSha256)||typeof e.preparedReading!=='string'||new TextEncoder().encode(e.preparedReading).byteLength>4096)return null;
  const r=JSON.parse(e.preparedReading);
  if(!validCurrentBasket(r,r.priceAsOf))return null;
  if(r.code!=='XLI'||r.isCurrentFundNAV!==false||r.isCurrentFundHoldings!==false||r.historicalRankEligible!==false||!instant(r.observedAt)||!instant(r.preparedAt)||r.observedAt>r.preparedAt||r.preparedAt>e.verifiedAt||r.holdingsAsOf!=='2026-06-30')return null;
  for(const k of ['pb','ps'] as const){const m=r.metrics?.[k];if(!m||m.estimated!==true||m.rank!==null||m.percentile!==null||m.sourceComparison!==null||!Number.isFinite(m.unknownWeight)||m.unknownWeight<0||m.unknownWeight>1||m.value!==null&&(!Number.isFinite(m.value)||m.value<=0||m.unknownWeight>=.02-1e-12))return null;}
  return e;
 }catch{return null;}
}
const RELEASE=currentPublication(manifest);
/** Separate current-only endpoint: never queries or falls back to June history.
 * Exact byte/version proof follows a controlled full-payload SHA readback.
 */
export async function usETFCurrentResponse(db?:D1Database,proof:CurrentProof|null=RELEASE,now=Date.now()):Promise<Response>{
 const empty=()=>Response.json({data:null},{headers:{'Cache-Control':'public, max-age=60'}});
 if(!proof||!Number.isFinite(now)||Date.parse(proof.verifiedAt)>now)return empty();
 if(!db)return Response.json({error:'估值数据暂不可用'},{status:503});
 try{
  const result=await db.prepare("SELECT json_extract(payload,'$.preparedReading') AS reading FROM market_snapshot WHERE key=? AND updated_at=? AND json_extract(payload,'$.source')='self_us_etf_current_basket' AND json_extract(payload,'$.code')='XLI' AND length(CAST(json_extract(payload,'$.preparedReading') AS BLOB))<=4096 AND json_extract(payload,'$.preparedReading')=? LIMIT 1").bind(KEY,proof.version,proof.preparedReading).all<{reading:string}>();
  if(!result.success||result.results.length>1)throw Error('Current read failed');
  if(result.results.length===0)return empty();
  // D1 equality already binds the exact prevalidated byte sequence. No reparse,
  // historical iteration, upstream acquisition or calculations on HTTP.
  return new Response('{"data":'+result.results[0].reading+'}',{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60, s-maxage=60'}});
 }catch{return Response.json({error:'估值数据暂不可用'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
