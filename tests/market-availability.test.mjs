import assert from "node:assert/strict";
import test, {before, after} from "node:test";
import {createServer} from "vite";
let vite, market, source, app;
const originalFetch=globalThis.fetch, originalNow=Date.now;
let clock=Date.parse("2026-10-29T06:00:00Z"), mode="ok", priceRequests=0;
function cnFixture(symbol) {
 const key="sh"+symbol.slice(0,6),quote=Array(31).fill("");quote[1]="测试标的";quote[2]=symbol.slice(0,6);
 const rows=Array.from({length:60},(_,i)=>[new Date(clock-(59-i)*86400000).toISOString().slice(0,10),"100","101","102","99","1000"]);
 return {code:0,data:{[key]:{qt:{[key]:quote},day:rows}}};
}
before(async()=>{
 Date.now=()=>clock;
 globalThis.fetch=async(input)=>{
  const url=new URL(input);
  if(url.hostname==="baifenwei.com"||url.hostname==="fearandgreednow.com")return new Response("unavailable",{status:503});
  if(url.hostname==="web.ifzq.gtimg.cn"){
   priceRequests++;
   if(["recover","recover501"].includes(mode)&&priceRequests===1)return new Response("temporary",{status:mode==="recover501"?501:503});
   if(mode==="network"&&priceRequests===1)throw new TypeError("test network failure");
   if(mode==="malformed")return new Response("not-json");
   if(String(mode).startsWith("backoff"))return new Response("later",{status:503,headers:{"Retry-After":mode==="backoff-zero"?"0":mode==="backoff-invalid"?"invalid":"60"}});
   if(typeof mode==="number")return new Response("unavailable",{status:mode});
   const key=url.searchParams.get("param").split(",")[0];return Response.json(cnFixture(key.slice(2)+".SS"));
  }
  if(url.hostname.endsWith(".finance.yahoo.com")){
   const times=Array.from({length:60},(_,i)=>(clock-(60-i)*86400000)/1000);
   return Response.json({chart:{error:null,result:[{meta:{symbol:"^GSPC",exchangeTimezoneName:"America/New_York",currency:"USD"},timestamp:times,indicators:{quote:[{open:Array(60).fill(100),close:Array(60).fill(101),high:Array(60).fill(102),low:Array(60).fill(99),volume:Array(60).fill(1000)}]}}]}});
  }
  throw new Error("Unexpected source");
 };
 vite=await createServer({configFile:false,appType:"custom",server:{middlewareMode:true,hmr:false}});
 market=await vite.ssrLoadModule("/src/server/market-data.ts");source=await vite.ssrLoadModule("/src/server/source-errors.ts");
 app=(await import("../dist/_worker.js")).default;
});
after(async()=>{globalThis.fetch=originalFetch;Date.now=originalNow;await vite?.close();});
test("a cold valid quote survives noncritical sentiment failure and coalesces concurrent readers",async()=>{
 mode="ok";priceRequests=0;const values=await Promise.all(Array.from({length:6},()=>market.loadMarket("CN","600101.SS")));
 assert.equal(priceRequests,1);assert.ok(values.every(v=>v.price===101));assert.match(values[0].sentiment.error,/暂不可用/);
 await market.loadMarket("CN","600101.SS");assert.equal(priceRequests,1);
});
test("expired data is never returned as fresh; a rejected refresh clears pending and can recover",async()=>{
 clock+=61001;mode=503;priceRequests=0;
 await assert.rejects(market.loadMarket("CN","600101.SS"),/503/);assert.equal(priceRequests,2);
 mode="ok";const recovered=await market.loadMarket("CN","600101.SS");assert.equal(recovered.fetchedAt,new Date(clock).toISOString());assert.equal(priceRequests,3);
});
test("one quick transient 501, 503 or network failure is retried once and returns a validated fresh quote",async()=>{
 for(const [scenario,symbol] of [["recover","600102.SS"],["network","600103.SS"],["recover501","600104.SS"]]){
  mode=scenario;priceRequests=0;const quote=await market.loadMarket("CN",symbol);assert.equal(priceRequests,2);assert.equal(quote.instrument.symbol,symbol);assert.equal(quote.price,101);
 }
});
test("denials, throttling, Retry-After and malformed responses are not retried",async()=>{
 let number=600110;
 for(const scenario of [403,418,429,"backoff","backoff-zero","backoff-invalid","malformed"]){mode=scenario;priceRequests=0;await assert.rejects(market.loadMarket("CN",`${number++}.SS`));assert.equal(priceRequests,1);}
 const exhausted = new source.SourceError("already retried","test","http",100,503);exhausted.recoveryAttempted = true;assert.equal(source.isTransientSourceFailure(exhausted),false);
 assert.equal(source.isTransientSourceFailure(new source.SourceError("timeout","test","timeout",8000)),true);
 let timeouts=0;await assert.rejects(market.loadMarket("CN","600129.SS",async()=>{timeouts++;throw new source.SourceError("full timeout","test","timeout",8000);}));assert.equal(timeouts,1);
});
test("partial dashboard and first-page failures are no-store and expose only a bounded recovery hint",async()=>{
 mode=503;priceRequests=0;
 const html=await app.request("https://example.test/");assert.equal(html.status,200);assert.equal(html.headers.get("cache-control"),"no-store");
 const body=await html.text();assert.match(body,/行情暂不可用/);assert.match(body,/"retryable":false/);
 const dashboard=await app.request("https://example.test/api/markets");assert.equal(dashboard.headers.get("cache-control"),"no-store");const d=await dashboard.json();assert.equal(d.data.CN.snapshot,null);assert.ok(d.data.US.snapshot);
 const failed=await app.request("https://example.test/api/markets/CN");assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:"行情暂不可用",retryable:false});
 mode="ok";const healthy=await app.request("https://example.test/api/markets");assert.equal(healthy.headers.get("cache-control"),"public, max-age=15, s-maxage=60");assert.ok((await healthy.json()).data.CN.snapshot);
 mode=403;const denied=await app.request("https://example.test/api/markets/CN?symbol=600199.SS");assert.equal(denied.status,503);assert.deepEqual(await denied.json(),{error:"行情暂不可用",retryable:false});
});
