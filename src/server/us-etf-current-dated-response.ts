import datedManifest from '../../data/us-etf-current-dated-publication.json';
import currentManifest from '../../data/us-etf-current-publication.json';
import {currentPublication,usETFCurrentResponse} from './us-etf-current-response';
type DatedProof={date:string;key:string;version:string;observationSha256:string;payloadSha256:string;preparedReading:string;verifiedAt:string};
const hash=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const day=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
/** Only exact fully read-back immutable observations enter the deployed map.
 * No historical JSON scan, raw fact reconstruction or latest-pointer fallback. */
export function datedCurrentPublications(value:any):readonly DatedProof[]{
 try{if(value?.schema!=='verified-current-basket-dated-publication-v1'||!Array.isArray(value.entries)||value.entries.length>16)return[];
 const dates=new Set();for(const e of value.entries){if(!e||!day(e.date)||dates.has(e.date)||!hash(e.observationSha256)||!new RegExp('^current-observation/US/XLI/'+e.date+'/[a-f0-9]{64}$').test(e.key)||!currentPublication({schema:'verified-current-basket-publication-v1',entry:e})||JSON.parse(e.preparedReading).priceAsOf!==e.date)return[];dates.add(e.date);}return value.entries;
 }catch{return[];}
}
const DATED=datedCurrentPublications(datedManifest),CURRENT=currentPublication(currentManifest),CURRENT_DATE=CURRENT?JSON.parse(CURRENT.preparedReading).priceAsOf:null;
export async function usETFCurrentRoute(url:URL,db?:D1Database,dated:readonly DatedProof[]=DATED,now=Date.now(),current=CURRENT,currentDate=CURRENT_DATE):Promise<Response>{
 const date=url.searchParams.get('date');if(date===null)return usETFCurrentResponse(db,current,now);
 if(!day(date))return Response.json({error:'日期无效'},{status:400});
 if(current&&currentDate===date)return usETFCurrentResponse(db,current,now);
 const empty=()=>Response.json({data:null},{headers:{'Cache-Control':'public, max-age=60'}}),proof=dated.find(e=>e.date===date);
 if(!proof||!Number.isFinite(now)||Date.parse(proof.verifiedAt)>now)return empty();
 if(!db)return Response.json({error:'估值数据暂不可用'},{status:503});
 try{const r=await db.prepare("SELECT json_extract(payload,'$.preparedReading') AS reading FROM market_snapshot WHERE key=? AND updated_at=? AND json_extract(payload,'$.schema')='current-basket-archive-v1' AND json_extract(payload,'$.code')='XLI' AND json_extract(payload,'$.priceDate')=? AND json_extract(payload,'$.checkpointSha256')=? AND length(CAST(json_extract(payload,'$.preparedReading') AS BLOB))<=4096 AND json_extract(payload,'$.preparedReading')=? LIMIT 1").bind(proof.key,proof.version,date,proof.payloadSha256,proof.preparedReading).all<{reading:string}>();
  if(!r.success||r.results.length>1)throw Error('Dated current read failed');if(!r.results.length)return empty();
  return new Response('{"data":'+r.results[0].reading+'}',{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60, s-maxage=60'}});
 }catch{return Response.json({error:'估值数据暂不可用'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
