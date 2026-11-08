import test from 'node:test';import assert from 'node:assert/strict';
import {prepareQuarterlyETFRanks,DEFAULT_QUARTERLY_POLICY} from '../scripts/us-etf-valuation-history.mjs';
import {calculateETF} from '../scripts/us-etf-valuations.mjs';import {etfInput} from './us-etf-fixture.mjs';
const base=calculateETF(etfInput()).reading;
const exceptions={'2022-12-31':'2022-12-30','2023-09-30':'2023-09-29','2023-12-31':'2023-12-29','2024-03-31':'2024-03-28','2024-06-30':'2024-06-28'};
function point(date,pb=10,ps=5,availableAt){const winter=date.endsWith('12-31'),session=exceptions[date]??date;return {sourceSeriesId:'sec_nport_quarterly',reading:{...structuredClone(base),date,asOf:session+(winter?'T21:00:00Z':'T20:00:00Z'),availableAt:availableAt??date+(winter?'T21:00:00Z':'T20:00:00Z'),pricingBasis:'portfolio_fair_value_per_share',latestPriceMarketSession:session,pb:{...base.pb,value:pb},ps:{...base.ps,value:ps}}};}
const policy={minimumSamples:2,minimumSpanQuarters:1}; // Small synthetic test policy, not a production approval.
test('an explicit disabled policy returns actual sample metadata, never synthetic gaps',()=>{
 assert.deepEqual(DEFAULT_QUARTERLY_POLICY,{minimumSamples:20,minimumSpanQuarters:20});
 const out=prepareQuarterlyETFRanks([point('2026-06-30'),point('2025-09-30'),point('2025-03-31')],null);
 assert.equal(out.length,3);assert.equal(out.at(-1).pb.percentile,null);assert.equal(out.at(-1).pb.history.status,'policy_disabled');
 assert.deepEqual([out.at(-1).pb.history.sampleCount,out.at(-1).pb.history.windowStart,out.at(-1).pb.history.windowEnd,out.at(-1).pb.history.spanQuarters],[2,'2025-03-31','2025-09-30',2]);
});
test('midrank excludes current quarter and future disclosures, includes exact ten-year edge only, and separates metrics',()=>{
 const series=[point('2016-03-31',100,1),point('2016-06-30',10,null),point('2025-12-31',20,10),point('2026-03-31',1,1,'2026-07-01T12:00:00Z'),point('2026-06-30',20,5,'2026-08-28T16:00:00Z')];
 const last=prepareQuarterlyETFRanks(series,policy).at(-1);
 assert.equal(last.pb.percentile,75);assert.equal(last.pb.history.sampleCount,2);assert.equal(last.pb.history.windowStart,'2016-06-30');
 assert.equal(last.ps.percentile,null);assert.equal(last.ps.history.sampleCount,1);assert.equal(last.ps.history.status,'insufficient_samples');
});
test('minimum span and current missing values independently suppress ranks without hiding actual counts',()=>{
 const series=[point('2025-09-30'),point('2025-12-31'),point('2026-03-31',null),point('2026-06-30')];
 const result=prepareQuarterlyETFRanks(series,{minimumSamples:2,minimumSpanQuarters:3});
 assert.equal(result.at(-1).pb.history.status,'insufficient_span');assert.equal(result.at(-1).pb.percentile,null);assert.equal(result[2].pb.history.status,'current_missing');assert.equal(result[2].pb.history.sampleCount,2);
});
test('constant prior samples give midpoint rather than a false extreme',()=>{
 const result=prepareQuarterlyETFRanks([point('2025-12-31'),point('2026-03-31'),point('2026-06-30')],policy);
 assert.equal(result.at(-1).pb.percentile,50);assert.equal(result.at(-1).ps.percentile,50);
});
test('duplicate quarters, source/method/basis mixing, invalid time or values, and implicit thresholds fail closed',()=>{
 const series=[point('2025-12-31'),point('2026-03-31')];
 assert.throws(()=>prepareQuarterlyETFRanks([series[0],series[0]],policy),/Duplicate/);
 for(const mutate of [x=>x.sourceSeriesId='other',x=>x.reading.code='XLF',x=>x.reading.methodVersion='other',x=>x.reading.pricingBasis='unadjusted_close',x=>x.reading.asOf='2026-03-31T21:00:00Z',x=>x.reading.availableAt='2026-03-30T21:00:00Z',x=>x.reading.pb.value=Infinity,x=>x.reading.pb.verifiedCoverage=.97]){
  const bad=structuredClone(series);mutate(bad[1]);assert.throws(()=>prepareQuarterlyETFRanks(bad,policy));
 }
 for(const p of [{},{minimumSamples:1,minimumSpanQuarters:1},{minimumSamples:2,minimumSpanQuarters:0},{...policy,windowYears:20}])assert.throws(()=>prepareQuarterlyETFRanks(series,p),/policy/);
});

test('approved uniform gate requires twenty prior quarters and at least five years between first and last',()=>{
 const series=[];for(let i=0;i<24;i++){const year=2019+Math.floor((2+i)/4),q=(2+i)%4,date=new Date(Date.UTC(year,(q+1)*3,0)).toISOString().slice(0,10);series.push(point(date,10+i,5+i));}
 const ranked=prepareQuarterlyETFRanks(series);
 assert.equal(ranked[20].pb.history.sampleCount,20);assert.equal(ranked[20].pb.history.spanQuarters,19);assert.equal(ranked[20].pb.percentile,null);assert.equal(ranked[20].pb.history.status,'insufficient_span');
 assert.equal(ranked[21].pb.history.sampleCount,21);assert.equal(ranked[21].pb.history.spanQuarters,20);assert.equal(ranked[21].pb.percentile,100);
 const sparse=series.slice();sparse[5]=point(sparse[5].reading.date,null,null);const last=prepareQuarterlyETFRanks(sparse)[21];assert.equal(last.pb.history.sampleCount,20);assert.equal(last.pb.history.spanQuarters,20);assert.equal(last.pb.percentile,100);
 const fewer=sparse.slice();fewer[6]=point(fewer[6].reading.date,null,null);assert.equal(prepareQuarterlyETFRanks(fewer)[21].pb.percentile,null);
});
