import { validChinaOverview, type IndexValuation } from '../lib/china-overview';
const CODES=['000300','000905','000016','399001','399006','000922','000688','HSI','HSTECH','000906','000852','399005'];
/** Native SQL projects only one precomputed observation per fixed index. No raw
 * history, ranking calculation, source request or write is performed by readers. */
export async function valuationResponse(url:URL,db?:D1Database):Promise<Response>{
 const date=url.searchParams.get('date')??'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return Response.json({error:'日期无效'},{status:400});
 if(!db)return Response.json({error:'估值数据暂不可用'},{status:503});
 try{
  const path=`$.history."${date}"`;
  const result=await db.prepare(`SELECT key, CASE WHEN length(CAST(json_extract(payload, ?) AS BLOB))<=4096 THEN json_extract(payload, ?) ELSE NULL END AS reading FROM market_snapshot WHERE key IN (${CODES.map(()=>'?').join(',')}) AND json_extract(payload,'$.source')='efunds_index' LIMIT 12`).bind(path,path,...CODES.map(code=>'valuation/'+code)).all<{key:string;reading:string|null}>();
  if(!result.success||result.results.length>12)throw Error('Valuation projection failed');
  const rows:IndexValuation[]=[];
  for(const entry of result.results){if(!entry.reading)continue;const row=JSON.parse(entry.reading);if(row.date!==date||entry.key!=='valuation/'+row.code||!validChinaOverview({sourceIds:{},history:{},valuations:{sourceId:'efunds_index',period:'近十年内 · 独立分位',rows:[row]}},date))throw Error('Invalid prepared valuation');rows.push(row);}
  return Response.json({data:{date,rows}},{headers:{'Cache-Control':'public, max-age=60, s-maxage=60'}});
 }catch{return Response.json({error:'估值数据暂不可用'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
