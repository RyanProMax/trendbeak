import assert from "node:assert/strict";
import test,{before,after} from "node:test";
const real={fetch:globalThis.fetch,now:Date.now,caches:globalThis.caches};
let clock=Date.parse("2026-10-29T04:00:00.000Z"),fail=false,warm,cold;
const stored=new Map();
function bars(){return Array.from({length:400},(_,i)=>new Date(clock-(399-i)*86400000).toISOString().slice(0,10));}
before(async()=>{
 Date.now=()=>clock;
 globalThis.caches={default:{match:async key=>stored.get(key.url)?.clone(),put:async(key,response)=>{stored.set(key.url,response.clone())}}};
 globalThis.fetch=async input=>{
  const url=new URL(input);
  if(url.hostname==='web.ifzq.gtimg.cn'){
   if(fail)return new Response('injected 501',{status:501});
   const key=url.searchParams.get('param').split(',')[0],qt=Array(31).fill('');qt[1]='测试标的';qt[2]=key.slice(2);
   return Response.json({code:0,data:{[key]:{qt:{[key]:qt},day:bars().map(d=>[d,'100','101','102','99','1000'])}}});
  }
  if(url.hostname.endsWith('.finance.yahoo.com')){
   if(fail)return new Response('injected timeout-like failure',{status:503});
   return Response.json({chart:{error:null,result:[{meta:{symbol:'^GSPC',exchangeTimezoneName:'America/New_York',currency:'USD'},timestamp:bars().map(d=>Date.parse(d+'T01:00:00Z')/1000),indicators:{quote:[{open:bars().map(()=>100),close:bars().map(()=>101),high:bars().map(()=>102),low:bars().map(()=>99),volume:bars().map(()=>1000)}]}}]}});
  }
  return new Response('noncritical sentiment unavailable',{status:503});
 };
 warm=(await import('../dist/_worker.js?fallback-warm')).default;
});
after(()=>{globalThis.fetch=real.fetch;Date.now=real.now;if(real.caches===undefined)delete globalThis.caches;else globalThis.caches=real.caches;});
test('SSR/API share validated fresh records; public responses never leak the seven-day physical TTL',async()=>{
 const res=await warm.request('https://trendbeak.com/');assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-cache');await res.text();
 const api=await warm.request('https://trendbeak.com/api/markets/CN');assert.equal(api.status,200);assert.equal(api.headers.get('cache-control'),'no-cache');const data=(await api.json()).data;assert.equal(data.freshness.state,'fresh');assert.equal(data.freshness.via,'memory');assert.ok(stored.size>=2);
});
test('a new compiled Worker instance serves stale from edge on injected failures, including first-page SSR and health',async()=>{
 clock+=61000;fail=true;cold=(await import('../dist/_worker.js?fallback-cold')).default;
 const api=await cold.request('https://trendbeak.pages.dev/api/markets/CN');assert.equal(api.status,200);const quote=(await api.json()).data;assert.equal(quote.freshness.state,'stale');assert.equal(quote.freshness.via,'edge');assert.equal(quote.fetchedAt,'2026-10-29T04:00:00.000Z');
 const page=await cold.request('https://trendbeak.com/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/暂未更新/);assert.match(html,/最近更新/);assert.doesNotMatch(html,/行情恢复后显示指标/);assert.match(html,/盘中快照/);
 const health=await cold.request('https://trendbeak.com/api/health');assert.equal(health.status,503);const h=(await health.json()).data;assert.equal(h.status,'degraded');assert.equal(h.markets.CN.available,true);assert.equal(h.markets.CN.freshness.state,'stale');
});
test('a different symbol with no successful snapshot remains no-store 503 and cannot receive the benchmark price',async()=>{const res=await cold.request('https://trendbeak.com/api/markets/CN?symbol=600000.SS');assert.equal(res.status,503);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).data,undefined);});
test('recovery replaces the matching last-good and removes stale from SSR',async()=>{clock+=16000;fail=false;const res=await cold.request('https://trendbeak.com/api/markets/CN');const s=(await res.json()).data;assert.equal(s.freshness.state,'fresh');assert.equal(s.fetchedAt,new Date(clock).toISOString());const page=await cold.request('https://trendbeak.com/');assert.doesNotMatch(await page.text(),/暂未更新/);});
