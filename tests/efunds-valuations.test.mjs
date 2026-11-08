import test from'node:test';import assert from'node:assert/strict';
import{efundsDetail,initializeEfunds,validateEfundsCheckpoint,mergeEfunds,parseValuationTail,refreshEfunds}from'../scripts/efunds-valuations.mjs';
const code='000688',url=`https://cdn.efunds.com.cn/etf-net/index_valuation_percentile_${code}.json`,detail={success:true,code:'0000',data:{trdCode:code,indexName:'测试指数',authorizedIndex:true,valuationPercentileJson:url}},info=efundsDetail(detail,code),tag='"initial"',next='"changed"';
const rows=Array.from({length:100},(_,i)=>({trdCode:code,trdDt:new Date(Date.UTC(2001,0,1+i)).toISOString().slice(0,10),pBLf:1+i/100,pSTtm:2+i/100})),today='2001-12-31';
test('official detail identity and static URL are fixed, and eligibility cannot become site redistribution permission',()=>{assert.equal(info.code,code);assert.equal(efundsDetail({...detail,data:{...detail.data,authorizedIndex:false}},code).code,code);assert.throws(()=>efundsDetail({...detail,data:{...detail.data,valuationPercentileJson:'https://example.invalid/data'}},code),/URL/);assert.throws(()=>efundsDetail(detail,'000905'),/identity/);});
test('historical midrank excludes current, keeps nulls and legitimate boundary ranks, and rejects fabricated dates/zeros',()=>{
 const r=initializeEfunds(info,rows,tag,today);assert.equal(r.reading.pb.percentile,100);assert.equal(r.samples.pb,99);assert.equal(r.reading.pb.value,1.99);assert.equal(r.reading.pb.from,rows[0].trdDt);assert.equal(r.reading.pb.through,rows[98].trdDt);
 assert.equal(validateEfundsCheckpoint(r.checkpoint,today),r.checkpoint);for(const patch of[{pb:[]},{ps:[...r.checkpoint.ps].reverse()},{pb:r.checkpoint.pb.map(()=>9)}])assert.throws(()=>validateEfundsCheckpoint({...r.checkpoint,...patch},today),/checkpoint/);
 const tied=initializeEfunds(info,rows.map(r=>({...r,pBLf:2})),tag,today);assert.equal(tied.reading.pb.percentile,50);
 assert.equal(initializeEfunds(info,rows.map((r,i)=>i===99?{...r,pBLf:.5}:r),tag,today).reading.pb.percentile,0);
 const missing=initializeEfunds(info,rows.map((r,i)=>i===99?{...r,pBLf:null,pBLf10Y:0}:r),tag,today);assert.deepEqual(missing.reading.pb,{value:null,percentile:null});assert.equal(missing.reading.ps.percentile,100);
 assert.equal(initializeEfunds(info,rows.slice(0,60),tag,today).reading.pb.percentile,null);assert.equal(initializeEfunds(info,rows.slice(0,61),tag,today).reading.pb.percentile,100);
 for(const patch of[{trdDt:'2001-02-30'},{trdDt:'2002-01-01'},{pBLf:0},{pSTtm:''},{trdCode:'000300'}])assert.throws(()=>initializeEfunds(info,[{...rows[0],...patch}],tag,today));
});
test('append, five-row revision, expiry and repeated input reuse the sorted calculation checkpoint',()=>{
 const a=initializeEfunds(info,rows.slice(0,-1),tag,today),b=mergeEfunds(a.checkpoint,rows.slice(-10),next,today),full=initializeEfunds(info,rows,next,today);assert.equal(b.processed,1);assert.deepEqual(b.checkpoint,full.checkpoint);assert.equal(mergeEfunds(b.checkpoint,rows.slice(-10),next,today).processed,0);
 const changed=rows.slice(-10).map((r,i)=>i===8?{...r,pBLf:.8,pSTtm:null}:r),revised=mergeEfunds(b.checkpoint,changed,next,today),baseline=initializeEfunds(info,rows.map(r=>r.trdDt===changed[8].trdDt?changed[8]:r),next,today);assert.equal(revised.processed,1);assert.deepEqual(revised.checkpoint,baseline.checkpoint);assert.deepEqual(revised.reading,baseline.reading);assert.notDeepEqual(b.checkpoint.pb,revised.checkpoint.pb);
 assert.throws(()=>mergeEfunds(b.checkpoint,rows.slice(-10).map((r,i)=>i===0?{...r,pBLf:.8}:r),next,today),/Older/);assert.throws(()=>mergeEfunds(b.checkpoint,rows.slice(-10).filter((_,i)=>i!==5),next,today),/disappeared/);
 const old=initializeEfunds(info,[{...rows[0],trdDt:'1990-01-01'},...rows],tag,today);assert.equal(old.checkpoint.rows[0][0],'2001-01-01');
 const initial=[{...rows[0],trdDt:'2000-01-01'},...rows.map(r=>({...r,trdDt:r.trdDt.replace('2001','2009')}))],aged=initializeEfunds(info,initial,tag,'2009-12-31'),appended={...rows.at(-1),trdDt:'2010-01-02'},slid=mergeEfunds(aged.checkpoint,[...initial.slice(-5),appended],next,'2010-01-02');assert.ok(slid.checkpoint.rows.some(r=>r[0]==='2000-01-01'));assert.deepEqual(slid.checkpoint,initializeEfunds(info,[...initial,appended],next,'2010-01-02').checkpoint);assert.ok(slid.reading.pb.from>'2000-01-01');
});
test('range suffix discards only its first partial row and handles quoted braces without constructing fake rows',()=>{
 const sample=rows.slice(-15).map(r=>({...r,note:'}, { and "quoted"',nested:{label:'literal }'}})),text=JSON.stringify(sample),partial=text.slice(23);assert.deepEqual(parseValuationTail(partial),sample.slice(1));assert.deepEqual(parseValuationTail(text),sample);assert.throws(()=>parseValuationTail(text.slice(0,-1)),/array/);assert.throws(()=>parseValuationTail(JSON.stringify(rows)),/32/);
});
test('304 does not inspect history or recalculate, and source failures never fall back to a full body',async()=>{
 const prior={source:'efunds_index',code,etag:tag,get rows(){throw Error('History was inspected');}};let calls=0;const r=await refreshEfunds(prior,today,async(u,o)=>{calls++;assert.equal(u,url);assert.equal(o.headers.Range,'bytes=-16384');assert.equal(o.headers['If-None-Match'],tag);return new Response(null,{status:304,headers:{etag:tag}});});assert.equal(r.checkpoint,prior);assert.equal(r.processed,0);assert.equal(calls,1);
 let canceled=false;await assert.rejects(refreshEfunds(prior,today,async()=>new Response(new ReadableStream({cancel(){canceled=true;}}),{headers:{etag:next}})),/no full fallback/);assert.equal(canceled,true);
 for(const status of[403,429,412]){let n=0;await assert.rejects(refreshEfunds(prior,today,async()=>{n++;return new Response(null,{status});}));assert.equal(n,1);}
});
test('a changed validated suffix updates one observation while malformed/truncated responses preserve the old object',async()=>{
 const old=initializeEfunds(info,rows.slice(0,-1),tag,today).checkpoint,text=JSON.stringify(rows.slice(-15)),bytes=Buffer.byteLength(text),reader=async()=>new Response(text,{status:206,headers:{etag:next,'content-range':`bytes 0-${bytes-1}/${bytes}`}});const r=await refreshEfunds(old,today,reader);assert.equal(r.processed,1);assert.equal(r.bytes,bytes);assert.equal(old.rows.length,99);
 await assert.rejects(refreshEfunds(old,today,async()=>new Response(text.slice(1),{status:206,headers:{etag:next,'content-range':`bytes 0-${bytes-1}/${bytes}`}})),/Truncated/);assert.equal(old.rows.length,99);
});
test('full-source preparation retains a year of exact dates with independent ten-year windows and bounded bytes',()=>{
 const full=[];for(let t=Date.parse('2015-01-01');t<=Date.parse('2026-01-01');t+=86400000){const d=new Date(t);if(d.getUTCDay()===0||d.getUTCDay()===6)continue;full.push({...rows[0],trdDt:d.toISOString().slice(0,10),pBLf:1+(full.length%101)/100,pSTtm:2+(full.length%87)/100});}
 const result=initializeEfunds(info,full,tag,'2026-01-01'),c=result.checkpoint;
 assert.ok(c.rows.length>2700);assert.ok(Buffer.byteLength(JSON.stringify(c))<350000);
 assert.ok(c.pb.length<c.rows.length);validateEfundsCheckpoint(c,'2026-01-01');const added={...full.at(-1),trdDt:'2026-01-02',pBLf:3};const delta=mergeEfunds(c,[...full.slice(-5),added],next,'2026-01-02');assert.deepEqual(delta.checkpoint,initializeEfunds(info,[...full,added],next,'2026-01-02').checkpoint);validateEfundsCheckpoint(delta.checkpoint,'2026-01-02');
 assert.equal(c.sourceStart,'2015-01-01');assert.ok(Object.keys(c.history).length>250);
 for(const[d,r]of Object.entries(c.history).filter((_,i)=>i%60===0)){assert.equal(r.date,d);assert.deepEqual(r,initializeEfunds(info,full.filter(x=>x.trdDt<=d),tag,d).reading);}
 const legacy={...c};delete legacy.sourceStart;delete legacy.history;
 const refreshed=mergeEfunds(legacy,full.slice(-5),next,'2026-01-01');assert.equal(refreshed.checkpoint.history,undefined);
});
