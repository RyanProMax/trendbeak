import {prepareChinaBenchmark} from './china-overview';
// Controlled jobs only: materialize the actual HTTP data, without timestamps that
// change merely because somebody reads it. The reader appends tiny freshness metadata.
import type{MarketSnapshot,SentimentData}from'../market-types';
import type{MarketState}from'./market-sync';
import{validSnapshot}from'../lib/snapshot-record';
import{SENTIMENT_SOURCES,DEFAULT_SENTIMENT_SOURCE}from'../lib/sentiment-sources';
export async function attachHTTP(db:D1Database,prepared:{payload:MarketState;text:string;bytes:number;key:string;processed:number},now=Date.now(),rebuildOverview=false){
 const view=prepared.payload.view,market=view.instrument.market,source=DEFAULT_SENTIMENT_SOURCE[market];
 const end=await db.prepare("SELECT MAX(json_extract(payload,'$.view.asOf')) AS latest FROM market_snapshot WHERE key IN (?,?)").bind('CN/000300.SS','US/^GSPC').all<{latest:string}>();if(!end.success)throw Error('Response window lookup failed');const to=[view.asOf,end.results[0]?.latest].filter(Boolean).sort().at(-1)!,from=new Date(Date.parse(to)-371*86400000).toISOString().slice(0,10);
 const result=await db.prepare('SELECT market,date,source,score,updated_at FROM sentiment_daily WHERE market=? AND source IN (?,?) AND date>=? AND date<=? ORDER BY source,date LIMIT 745').bind(market,source,market==='US'?'cnn_benzinga':source,from,to).all<{market:string;date:string;source:string;score:number;updated_at:string}>();if(!result.success||result.results.length>744)throw Error('HTTP sentiment projection failed; existing response retained');
 const info=SENTIMENT_SOURCES[source],rows=result.results.filter(r=>r.source===source),reports=result.results.filter(r=>r.source==='cnn_benzinga');if(rows.length>372||reports.length>372||result.results.some(r=>r.market!==market||![source,'cnn_benzinga'].includes(r.source)||r.date<from||r.date>to||!Number.isFinite(Date.parse(r.updated_at))))throw Error('Invalid response observation input');
 const sentiment:SentimentData={source:{name:info.name,url:info.url},description:info.description,observations:rows.map((r,i)=>({date:r.date,value:r.score,previous:rows[i-1]?.score??null})),...(reports.length?{reportedObservations:reports.map(r=>({date:r.date,value:r.score,previous:null,source:{name:SENTIMENT_SOURCES.cnn_benzinga.name,url:SENTIMENT_SOURCES.cnn_benzinga.url}}))}:{})};
 let overviewProcessed=0;if(prepared.payload.overviewState){if(prepared.processed>32&&!rebuildOverview)throw Error('Explicit overview rebuild required');const updated=await prepareChinaBenchmark(db,prepared.payload,rows,rebuildOverview);prepared={...prepared,payload:updated.payload};overviewProcessed=updated.processed;}
 const data:MarketSnapshot={...prepared.payload.view,sentiment};if(!validSnapshot(data,market,view.instrument.symbol,now))throw Error('Invalid prepared HTTP response');// Six-axis benchmark readers do not consume the retired four-axis radar. Keep
 // its complete calculation/view checkpoint, but omit that optional transport field.
 const responseData=data.chinaOverview||data.usOverview?{...data,history:Object.fromEntries(Object.entries(data.history).map(([date,{radar:_,...reading}])=>[date,reading]))}:data;
 const overview=JSON.stringify({data:responseData});
 // Old open pages still consume four-axis history and cannot decode newly added
 // CN provider IDs. Keep a prepared legacy projection; never relabel that source.
 const legacyChina=data.chinaOverview?{...data.chinaOverview,sourceIds:Object.fromEntries(Object.entries(data.chinaOverview.sourceIds).filter(([,source])=>source!=='self_kph_activity')),history:Object.fromEntries(Object.entries(data.chinaOverview.history).map(([date,row])=>[date,Object.fromEntries(Object.entries(row).filter(([id])=>data.chinaOverview!.sourceIds[id as keyof typeof data.chinaOverview.sourceIds]!=='self_kph_activity'))]))}:undefined;
 const {usOverview:_,...legacy}=data;const body=JSON.stringify({data:{...legacy,...(legacyChina?{chinaOverview:legacyChina}:{})}});if([body,overview].some(text=>new TextEncoder().encode(text).length>300000))throw Error('HTTP response byte budget exceeded');const payload={...prepared.payload,http:{body,...(data.chinaOverview||data.usOverview?{overview}:{})}},text=JSON.stringify(payload),bytes=new TextEncoder().encode(text).length;if(bytes>1800000)throw Error('Stored response exceeds row budget');return{...prepared,payload,text,bytes,overviewProcessed};
}
