import manifest from '../../data/us-etf-reported-publication.json';
import {validReportedETFReading,REPORTED_ETF_METHOD,REPORTED_ETF_SCOPE}from'../lib/us-etf-reported';
export const REPORTED_POINT_KEY=`valuation-method/US/XLK/${REPORTED_ETF_METHOD}/${REPORTED_ETF_SCOPE}/2026-06-30`;
export type ReportedPublicationProof={key:string;version:string;verifiedAt:string;payloadSha256:string;candidateSha256:string;sourceBundleSha256:string;sourceReviewSha256:string;preparedReading:string};
const instant=(x:unknown):x is string=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
/** Only a proof made after controlled exact-byte readback may activate a row. */
export function reportedPublication(value:unknown):ReportedPublicationProof|null{
 try{
  const p=value as {schema?:string;entry?:ReportedPublicationProof},e=p?.entry;
  if(p?.schema!=='verified-reported-common-publication-v1'||!e||Object.keys(e).some(k=>!['key','version','verifiedAt','payloadSha256','candidateSha256','sourceBundleSha256','sourceReviewSha256','preparedReading'].includes(k))||e.key!==REPORTED_POINT_KEY||!instant(e.version)||!instant(e.verifiedAt)||e.version>e.verifiedAt||!['payloadSha256','candidateSha256','sourceBundleSha256','sourceReviewSha256'].every(k=>/^[a-f0-9]{64}$/.test(e[k as keyof ReportedPublicationProof]))||typeof e.preparedReading!=='string'||new TextEncoder().encode(e.preparedReading).byteLength>4096)return null;
  const row=JSON.parse(e.preparedReading);if(!validReportedETFReading(row)||row.preparedAt>e.verifiedAt)return null;return e;
 }catch{return null;}
}
const RELEASE=reportedPublication(manifest);
const empty=()=>Response.json({data:null},{headers:{'Cache-Control':'public, max-age=60'}});
/** Separate exact point read. No old-method fallback, history traversal, source
 * request or recalculation. Optional date means explicit latest approved point,
 * which still carries its own economic date and retrospective label. */
export async function usETFReportedResponse(url:URL,db?:D1Database,proof:ReportedPublicationProof|null=RELEASE,now=Date.now()):Promise<Response>{
 for(const key of url.searchParams.keys())if(key!=='date')return Response.json({error:'估值参数无效'},{status:400});
 const date=url.searchParams.get('date');
 if(date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))return Response.json({error:'日期无效'},{status:400});
 if(date!==null&&date!=='2026-06-30'||!proof||!Number.isFinite(now)||Date.parse(proof.verifiedAt)>now)return empty();
 if(!db)return Response.json({error:'估值数据暂不可用'},{status:503});
 try{
  const r=await db.prepare("SELECT json_extract(payload,'$.preparedReading') AS reading FROM market_snapshot WHERE key=? AND updated_at=? AND json_extract(payload,'$.source')='self_us_etf_reported_common' AND json_extract(payload,'$.code')='XLK' AND json_extract(payload,'$.methodVersion')=? AND json_extract(payload,'$.scopeRevision')=? AND json_extract(payload,'$.economicDate')='2026-06-30' AND length(CAST(payload AS BLOB))<=1800000 AND json_extract(payload,'$.registry.candidateSha256')=? AND json_extract(payload,'$.candidate.sourceBundleSha256')=? AND json_extract(payload,'$.registry.sourceReviewSha256')=? AND length(CAST(json_extract(payload,'$.preparedReading') AS BLOB))<=4096 AND json_extract(payload,'$.preparedReading')=? LIMIT 1").bind(REPORTED_POINT_KEY,proof.version,REPORTED_ETF_METHOD,REPORTED_ETF_SCOPE,proof.candidateSha256,proof.sourceBundleSha256,proof.sourceReviewSha256,proof.preparedReading).all<{reading:string}>();
  if(!r.success||r.results.length>1)throw Error('Reported point read failed');
  if(r.results.length===0)return empty();
  return new Response('{"data":'+r.results[0].reading+'}',{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60, s-maxage=60'}});
 }catch{return Response.json({error:'估值数据暂不可用'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
