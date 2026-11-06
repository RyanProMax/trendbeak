import type {SnapshotEdgeCache} from './snapshot-cache';
export const MARKET_CACHE_MS=300000;
export interface PreparedMarketBody {body:string|null;etag:string}
const response=(value:PreparedMarketBody,body:BodyInit|null=value.body)=>new Response(body,{status:body===null?304:200,headers:{'Cache-Control':'no-cache',ETag:value.etag,...(body===null?{}:{'Content-Type':'application/json; charset=UTF-8'})}});
const encoder=new TextEncoder();
const matches=(header:string|null,tag:string)=>header?.split(',').some(v=>v.trim()==='*'||v.trim().replace(/^W\//,'')===tag.replace(/^W\//,''))??false;
/** Cache API entries are local to a Cloudflare location, not global memory.
 * Bucket keys bound publication delay without a D1 version check on a hit. */
export function createMarketEdgeCache(clock=Date.now){
 let bypassUntil=0;
 return{async get(request:Request,market:string,symbol:string,edge:SnapshotEdgeCache|undefined,read:()=>Promise<PreparedMarketBody>){
  if(!edge||clock()<bypassUntil)return response(await read());
  const bucket=Math.floor(clock()/MARKET_CACHE_MS),key=new Request(`${new URL(request.url).origin}/__market-cache/v4/${market}/${bucket}?symbol=${encodeURIComponent(symbol)}`);
  try{
   const hit=await edge.match(key),tag=hit?.headers.get('ETag');
   if(hit?.status===200&&tag?.startsWith(`W/"http-v1:${market}/${symbol}:`)&&hit.headers.get('Content-Type')==='application/json; charset=UTF-8'){
    if(matches(request.headers.get('If-None-Match'),tag)){void hit.body?.cancel().catch(()=>{});return new Response(null,{status:304,headers:{ETag:tag,'Cache-Control':'no-cache'}});}
    return new Response(hit.body,{headers:{ETag:tag,'Cache-Control':'no-cache','Content-Type':'application/json; charset=UTF-8'}});
   }
   void hit?.body?.cancel().catch(()=>{});
  }catch(error){bypassUntil=clock()+60000;console.error('Market edge cache read failed',String(error));}
  const value=await read();
  // Keep the prepared JSON opaque. Encode once, then give cache/client separate
  // native responses over the bytes, with no Response.clone stream tee or rewrap.
  if(value.body!==null&&clock()>=bypassUntil){
   const bytes=encoder.encode(value.body);
   try{await edge.put(key,new Response(bytes,{headers:{ETag:value.etag,'Content-Type':'application/json; charset=UTF-8','Cache-Control':`public, max-age=${Math.max(1,Math.ceil(((bucket+1)*MARKET_CACHE_MS-clock())/1000))}`}}));}
   catch(error){bypassUntil=clock()+60000;console.error('Market edge cache write failed',String(error));}
   return response(value,bytes);
  }
  return response(value);
 }};
}
export const marketEdgeCache=createMarketEdgeCache(()=>Date.now());
