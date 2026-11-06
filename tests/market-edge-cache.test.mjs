import assert from'node:assert/strict';import test,{before,after}from'node:test';import{createServer}from'vite';
let vite,cache;
before(async()=>{vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}});cache=await vite.ssrLoadModule('/src/server/market-edge-cache.ts');});after(async()=>vite?.close());
class Edge{map=new Map();async match(r){return this.map.get(r.url)?.clone();}async put(r,v){this.map.set(r.url,v.clone());}}
const request=(tag)=>new Request('https://trendbeak.com/api/markets/CN',tag?{headers:{'If-None-Match':tag}}:{});
const response=(v)=>({body:'{"data":{"version":'+v+'}}',etag:`W/"http-v1:CN/000300.SS:${v}"`});
test('edge hit survives a different isolate, returns 304 without D1, and a bucket refresh eventually exposes a new version',async()=>{let now=300000,db=0,upstream=0,version=1;const edge=new Edge(),read=async()=>{db++;return response(version);};const a=cache.createMarketEdgeCache(()=>now),b=cache.createMarketEdgeCache(()=>now);assert.equal((await a.get(request(),'CN','000300.SS',edge,read)).status,200);assert.equal(db,1);version=2;assert.equal((await(await b.get(request(),'CN','000300.SS',edge,read)).json()).data.version,1);assert.equal(db,1);const conditional=await b.get(request('"http-v1:CN/000300.SS:1"'),'CN','000300.SS',edge,read);assert.equal(conditional.status,304);assert.equal(await conditional.text(),'');assert.equal(db,1);now+=300000;assert.equal((await(await b.get(request(),'CN','000300.SS',edge,read)).json()).data.version,2);assert.equal(db,2);assert.equal(upstream,0);});
test('read failures/conditional misses never cache a body; cache errors keep the DB-only fallback',async()=>{
 const c=cache.createMarketEdgeCache(()=>0),edge=new Edge();await assert.rejects(c.get(request(),'CN','000300.SS',edge,async()=>{throw Error('DB missing or unavailable');}));assert.equal(edge.map.size,0);
 const conditional=await c.get(request(),'CN','000300.SS',edge,async()=>({body:null,etag:response(1).etag}));assert.equal(conditional.status,304);assert.equal(await conditional.text(),'');assert.equal(edge.map.size,0);
 let reads=0,attempts=0;const broken={async match(){attempts++;throw Error('cache unavailable');},async put(){throw Error('cache unavailable');}};
 const fallback=cache.createMarketEdgeCache(()=>0);for(let i=0;i<2;i++){const r=await fallback.get(request(),'CN','000300.SS',broken,async()=>{reads++;return response(1);});assert.equal(r.status,200);await r.text();}assert.equal(reads,2);assert.equal(attempts,1);
});
test('a miss preserves exact multilingual JSON bytes without clone, JSON parsing or stream tee',async()=>{
 const body='{"data":{"name":"沪深300 🐦","score":21.2386554621849}}',originalClone=Response.prototype.clone,originalParse=JSON.parse;let clones=0,cached;
 Response.prototype.clone=function(...args){clones++;return originalClone.apply(this,args);};JSON.parse=()=>{throw Error('No JSON parsing belongs in the cache fill');};
 try{const edge={async match(){return undefined;},async put(_,r){cached=new Uint8Array(await r.arrayBuffer());}},r=await cache.createMarketEdgeCache(()=>0).get(request(),'CN','000300.SS',edge,async()=>({body,etag:response(1).etag}));assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new TextEncoder().encode(body));assert.deepEqual(cached,new TextEncoder().encode(body));assert.equal(clones,0);}finally{Response.prototype.clone=originalClone;JSON.parse=originalParse;}
});
test('cache put failure cannot consume the client response or force a second DB read',async()=>{
 let reads=0;const body='{"data":{"name":"美股"}}',edge={async match(){return undefined;},async put(_,r){await r.arrayBuffer();throw Error('Injected storage failure');}};
 const r=await cache.createMarketEdgeCache(()=>0).get(request(),'CN','000300.SS',edge,async()=>{reads++;return{body,etag:response(1).etag};});assert.equal(await r.text(),body);assert.equal(reads,1);
});

test('the overview release does not reuse a previously cached body from the former namespace',async()=>{const edge=new Edge(),old=new Request('https://trendbeak.com/__market-cache/v1/CN/1?symbol=000300.SS');const prior=response(1);await edge.put(old,new Response(prior.body,{headers:{'Content-Type':'application/json; charset=UTF-8',ETag:prior.etag}}));let reads=0;const result=await cache.createMarketEdgeCache(()=>300000).get(request(),'CN','000300.SS',edge,async()=>{reads++;return response(2);});assert.equal((await result.json()).data.version,2);assert.equal(reads,1);});
