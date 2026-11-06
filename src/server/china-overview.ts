// Controlled offline writer only. No HTTP/browser import of the ranking engine.
import{CHINA_FACTORS,validChinaOverview,type ChinaFactor,type OverviewSource,type ChinaOverview,type FactorCell}from'../lib/china-overview';
import{historicalRank}from'../lib/radar-metrics';
export interface FactorInput{date:string;values:Partial<Record<ChinaFactor,number|null>>;counts?:Partial<Record<ChinaFactor,number[]>>}
export interface ChinaOverviewCheckpoint{sourceIds:ChinaOverview['sourceIds'];inputs:FactorInput[];history:ChinaOverview['history']}
/** Import only the four separately reviewed auxiliary series and one prepared
 * valuation view. Published fear/RSI always come from current durable data. */
export function mergeReviewedOverview(payload:import('./market-sync').MarketState,input:ChinaOverview){
 const view=payload.view;if(view.instrument.market!=='CN'||view.instrument.symbol!=='000300.SS'||!view.chinaOverview)throw Error('Prepared CN benchmark required');
 assertPublishableOverview(input,view.asOf);
 const external:ChinaFactor[]=['breadth','limitRatio','turnover','relativeTurnover'];
 if(Object.keys(input.sourceIds).some(id=>!external.includes(id as ChinaFactor))||Object.values(input.history).some(row=>Object.keys(row).some(id=>!external.includes(id as ChinaFactor))))throw Error('Reviewed import cannot replace primary sentiment or RSI');
 if(input.valuations?.rows.some(row=>!['000300','000905','000016','399001','399006','000922','000688','HSI','HSTECH','000906','000852','399005'].includes(row.code)))throw Error('Unreviewed valuation index');
 const cutoff=new Date(Date.parse(view.asOf)-364*86400000).toISOString().slice(0,10),history={...view.chinaOverview.history};
 for(const id of external)if(input.sourceIds[id]&&view.chinaOverview.sourceIds[id]!==input.sourceIds[id])for(const date of Object.keys(history)){history[date]={...history[date]};delete history[date][id];}
 for(const [date,row]of Object.entries(input.history)){if(date<cutoff)continue;history[date]={...history[date],...row};}
 const chinaOverview={...view.chinaOverview,sourceIds:{...view.chinaOverview.sourceIds,...input.sourceIds},history,...(input.valuations?{valuations:input.valuations}:{})};
 assertPublishableOverview(chinaOverview,view.asOf);
 return{...payload,view:{...view,chinaOverview}};
}
const approved:Partial<Record<ChinaFactor,OverviewSource[]>>={fearGreed:['baifenwei'],rsi:['self_csi300_rsi14_tencent'],breadth:['self_legu_activity','self_kph_activity'],limitRatio:['self_legu_activity','self_kph_activity'],turnover:['eastmoney_index'],relativeTurnover:['self_szse_turnover60_eastmoney']};
/** Supported sources are fixed in code. Access and publication instructions do
 * not establish a supplier licence; provenance remains explicit. */
export function assertPublishableOverview(view:ChinaOverview,today:string){
 if(!validChinaOverview(view,today))throw Error('Invalid China overview');
 for(const id of CHINA_FACTORS)if(Object.values(view.history).some(row=>row[id]?.[0]!==undefined&&row[id]?.[0]!==null)&&!approved[id]?.includes(view.sourceIds[id]!))throw Error('Factor source is not approved for publication: '+id);
 if(view.valuations?.rows.length&&view.valuations.sourceId!=='efunds_index')throw Error('Unsupported PB/PS source');
}
export function updateChinaOverview(input:FactorInput[],sourceIds:ChinaOverview['sourceIds'],today:string,old?:ChinaOverviewCheckpoint){
 if(!input.length||input.length>(old?32:800))throw Error('Overview input exceeds controlled window');
 if(old&&Object.entries(sourceIds).some(([id,source])=>old.sourceIds[id as ChinaFactor]&&old.sourceIds[id as ChinaFactor]!==source))throw Error('Do not merge factor sources; explicit reinitialization required');
 const sources={...old?.sourceIds,...sourceIds};
 const seen=new Set<string>();for(const row of input){if(seen.has(row.date)||!validChinaOverview({sourceIds:sources,history:{[row.date]:Object.fromEntries(Object.entries(row.values).map(([id,value])=>[id,[value,null,0]]))}},today))throw Error('Invalid overview source input');seen.add(row.date);}
 const byDate=new Map(old?.inputs.map(r=>[r.date,r])??[]);
 for(const row of input)byDate.set(row.date,{date:row.date,values:{...byDate.get(row.date)?.values,...row.values},...((row.counts??byDate.get(row.date)?.counts)?{counts:{...byDate.get(row.date)?.counts,...row.counts}}:{})});
 const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-640);
 const previous=new Map(old?.inputs.map(r=>[r.date,r])??[]);let start=0;if(old)while(start<rows.length&&previous.has(rows[start].date)&&JSON.stringify(rows[start])===JSON.stringify(previous.get(rows[start].date)))start++;if(old&&rows.length-start>32)throw Error('Older factor revision requires controlled repair');
 const history:ChinaOverview['history']={},ranks=Object.fromEntries(CHINA_FACTORS.map(id=>[id,rows.slice(0,start).map(r=>r.values[id]).filter((v):v is number=>typeof v==='number').slice(-252)]))as Record<ChinaFactor,number[]>;
 for(let i=0;i<start;i++)if(old?.history[rows[i].date])history[rows[i].date]=old.history[rows[i].date];
 for(let i=start;i<rows.length;i++){
  const result:Partial<Record<ChinaFactor,FactorCell>>={};
  for(const id of CHINA_FACTORS){const value=rows[i].values[id];if(value===undefined)continue;const ranked=historicalRank(value,ranks[id]);result[id]=[value,ranked.score===null?null:Math.round(ranked.score*10000)/10000,ranked.samples,...(rows[i].counts?.[id]?[rows[i].counts![id]]:[]) ]as FactorCell;if(value!==null){ranks[id].push(value);if(ranks[id].length>252)ranks[id].shift();}}
  history[rows[i].date]=result;
 }
 const cutoff=new Date(Date.parse(today)-364*86400000).toISOString().slice(0,10),visible=Object.fromEntries(Object.entries(history).filter(([date])=>date>=cutoff));
 const view:ChinaOverview={sourceIds:sources,history:visible};if(!validChinaOverview(view,today))throw Error('Invalid prepared overview');
 return{checkpoint:{sourceIds:sources,inputs:rows,history:visible}as ChinaOverviewCheckpoint,view,processed:rows.length-start};
}

/** Reuse the durable quote's already computed RSI and published sentiment. The
 * explicit first preparation/rebuild reads at most 800 dated scores; daily work
 * supplies only the recent 32 rows and reuses the previous ranking checkpoint. */
export async function prepareChinaBenchmark(db:D1Database,payload:import('./market-sync').MarketState,recent:readonly{date:string;score:number}[],initialize=false){
 const view=payload.view;if(view.instrument.market!=='CN'||view.instrument.symbol!=='000300.SS')throw Error('China overview requires the China benchmark');
 const old=initialize?undefined:payload.overviewState;if(!old&&!initialize)return{payload,processed:0};
 const all=payload.calculation.bars,bars=old?all.slice(-32):all;if(bars.length>800)throw Error('Explicit overview preparation exceeds 800 dates');
 let scores=recent;
 if(!old){const result=await db.prepare('SELECT date,score FROM sentiment_daily WHERE market=? AND source=? AND date>=? AND date<=? ORDER BY date LIMIT 801').bind('CN','baifenwei',bars[0].date,bars.at(-1)!.date).all<{date:string;score:number}>();if(!result.success||result.results.length>800)throw Error('Overview sentiment initialization exceeds its bound');scores=result.results;}
 const byDate=new Map(scores.map(r=>[r.date,r.score])),offset=all.length-bars.length;
 if(old){const previous=new Map(old.inputs.map(r=>[r.date,r.values.fearGreed]));if(scores.some(r=>r.date<bars[0].date&&previous.has(r.date)&&previous.get(r.date)!==r.score))throw Error('Older sentiment correction requires explicit overview initialization');}
 const input=bars.map((b,i)=>({date:b.date,values:{fearGreed:byDate.get(b.date)??null,rsi:payload.calculation.rows[offset+i].values.rsi}}));
 const updated=updateChinaOverview(input,{fearGreed:'baifenwei',rsi:'self_csi300_rsi14_tencent'},view.asOf,old);
 const carried=view.chinaOverview;const history={...updated.view.history};for(const [date,row]of Object.entries(carried?.history??{})){if(date<new Date(Date.parse(view.asOf)-364*86400000).toISOString().slice(0,10)||date>view.asOf)continue;const external=Object.fromEntries(Object.entries(row).filter(([id])=>id!=='fearGreed'&&id!=='rsi'));if(Object.keys(external).length)history[date]={...history[date],...external};}const overview={...updated.view,sourceIds:{...carried?.sourceIds,...updated.view.sourceIds},history,...(carried?.valuations?{valuations:carried.valuations}:{})};assertPublishableOverview(overview,view.asOf);
 return{payload:{...payload,overviewState:updated.checkpoint,view:{...view,chinaOverview:overview}},processed:updated.processed};
}
