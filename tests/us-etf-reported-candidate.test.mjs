import test from 'node:test';
import assert from 'node:assert/strict';
import {reportedHash, reportedCanonical, reportedBasketSkeleton} from '../scripts/us-etf-reported-candidate.mjs';

function fixture() {
  const source = {id:'source', url:'https://example.test/official.xml', evidence:'original source metadata'};
  const input = {code:'XLK', date:'2026-06-30', holdingsAsOf:'2026-06-30', cutoff:'2026-06-30T20:00:00Z', availableAt:'2026-08-28T16:30:53Z', pricingBasis:'portfolio_fair_value_per_share', stockWeight:.999, holdingsSource:'source', holdings:['A','B'].map((symbol,i) => ({symbol, securityId:'SECURITY'+i, weight:.4995, price:{value:100+i, asOf:'2026-06-30', availableAt:'2026-08-28T16:30:53Z', basis:'portfolio_fair_value_per_share', currency:'USD', source:'source'}, shares:{value:1}, equity:{value:2}, revenue:{value:3}, shareClassStatus:'verified_all_common', independentReview:'PASS'}))};
  const checkpoint = {code:'XLK', latest:{input}, provenance:{'2026-06-30':[source]}};
  return checkpoint;
}
function run(value=fixture()) { const bytes=Buffer.from(JSON.stringify(value));return reportedBasketSkeleton(bytes,{code:'XLK',date:'2026-06-30',checkpointSha256:reportedHash(bytes)}); }

test('canonical hashing rejects nonfinite, absent and non-JSON values',()=>{
  assert.equal(reportedCanonical({b:2,a:1}),'{"a":1,"b":2}');
  for (const value of [NaN,Infinity,undefined,()=>{},new Date(),{x:undefined}]) assert.throws(()=>reportedCanonical(value));
});
test('intake copies full identity/weights/marks but no legacy financial facts or approvals',()=>{
  const x=fixture(),before=JSON.stringify(x),r=run(x);assert.equal(JSON.stringify(x),before);
  assert.equal(r.positions.length,2);assert.equal(r.originalStockWeight,.999);assert.equal(r.positions[0].normalizedEquityWeight,.5);
  for(const p of r.positions){assert.equal(p.issuerId,null);assert.equal(p.capitalAdmission,null);assert.equal(p.bookAdmission,null);assert.equal(p.revenueAdmission,null);for(const forbidden of ['shares','equity','revenue','shareClassStatus','independentReview'])assert.equal(p[forbidden],undefined);}
  assert.equal(r.methodContractSha256,null);assert.equal(r.rankEligible,false);assert.equal(r.publishable,false);
});
test('exact root and requested ETF/date boundary are mandatory',()=>{
  const b=Buffer.from(JSON.stringify(fixture())),r={code:'XLK',date:'2026-06-30',checkpointSha256:reportedHash(b)};
  assert.throws(()=>reportedBasketSkeleton(Buffer.concat([b,Buffer.from(' ')]),r));
  for(const patch of [{code:'XLC'},{date:'2026-03-31'},{checkpointSha256:'x'}])assert.throws(()=>reportedBasketSkeleton(b,{...r,...patch}));
});
test('partial, duplicate, missing-source and mistimed inventories are rejected',()=>{
  for(const mutate of [x=>x.latest.input.holdings.pop(),x=>x.latest.input.holdings[1].securityId='SECURITY0',x=>x.latest.input.holdings[1].symbol='A',x=>x.latest.input.stockWeight=1,x=>x.provenance['2026-06-30']=[],x=>x.latest.input.holdings[0].price.source='unknown',x=>x.latest.input.holdings[0].price.availableAt='2027-01-01T00:00:00Z',x=>x.latest.input.holdings[0].price.asOf='2026-07-01',x=>x.latest.input.holdings[0].price.value=0]){const x=fixture();mutate(x);assert.throws(()=>run(x));}
});
