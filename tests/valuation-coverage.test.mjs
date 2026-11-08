import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
let vite, coverage;
before(async () => {
 vite = await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
 ({valuationCoverage:coverage}=await vite.ssrLoadModule('/src/lib/valuation-coverage.ts'));
});
after(async()=>vite?.close());
const reading=(from,through,samples=200)=>({from,through,samples});
test('decade coverage tolerates actual trading-day edges without listing exact dates',()=>{
 assert.equal(coverage(reading('2016-11-07','2026-11-05',2428)),'近 10 年');
 assert.equal(coverage(reading('2016-11-04','2026-11-03',2429)),'近 10 年');
 assert.equal(coverage(reading('2016-02-29','2026-02-27',2420)),'近 10 年');
 assert.equal(coverage(reading('2017-01-03','2026-11-05',2380)),'近 9 年 10 个月');
});
test('STAR50-scale and sub-year histories retain their real shorter coverage',()=>{
 assert.equal(coverage(reading('2020-07-23','2026-11-05',1500)),'近 6 年 3 个月');
 assert.equal(coverage(reading('2026-03-02','2026-11-05',170)),'近 8 个月');
 assert.equal(coverage(reading('2026-10-28','2026-11-05',7)),'不足 1 个月');
 assert.equal(coverage(reading('2024-01-31','2024-02-28',20)),'近 1 个月');
});
test('missing and invalid coverage stays neutral rather than fabricating a window',()=>{
 for(const value of [{},reading(undefined,'2026-11-05'),reading('2020-07-23',undefined),{from:'2020-07-23',through:'2026-11-05'},reading('2020-07-23','2026-11-05',0),reading('2026-11-06','2026-11-05'),reading('2026-02-30','2026-11-05')]) assert.equal(coverage(value),'—');
});
