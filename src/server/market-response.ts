import {marketEdgeCache} from './market-edge-cache';
import type {SnapshotEdgeCache} from './snapshot-cache';
import {BENCHMARKS} from '../market-types';
import {loadMarket,validSymbol,SnapshotMissing} from './market-data';

// Bounded reader: native Response, with no Hono Context/header wrapper allocation.
export async function marketResponse(request:Request,db:D1Database|undefined,url:URL,edge:SnapshotEdgeCache|undefined=typeof caches==='undefined'?undefined:(caches as unknown as {default?:SnapshotEdgeCache}).default) {
 const market=url.pathname.slice('/api/markets/'.length);
 const json=(body:object,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(market!=='CN'&&market!=='US')return json({error:'不支持的市场'},400);
 const symbol=url.searchParams.get('symbol')??BENCHMARKS[market].symbol;
 if(!validSymbol(market,symbol))return json({error:'股票代码无效'},400);
 try {
  return await marketEdgeCache.get(request,market,symbol,edge,()=>loadMarket(market,symbol,db,url.origin,request.headers.get('If-None-Match')??undefined,url.searchParams.get('view')==='sentiment-v1'));
 }catch(error){
  if(error instanceof SnapshotMissing)return json({error:'该股票的历史数据尚未收录',code:'snapshot_missing',retryable:false},404);
  console.error('Market snapshot read failed',{market,symbol,error:error instanceof Error?error.message:String(error)});
  return json({error:'行情暂不可用',retryable:false},503);
 }
}
