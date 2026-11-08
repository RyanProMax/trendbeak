import test from'node:test';import assert from'node:assert/strict';import{etfInput}from'./us-etf-fixture.mjs';import{calculateETF}from'../scripts/us-etf-valuations.mjs';
function quarter(date,session=date){const x=etfInput(),hour=date.endsWith('12-31')?'21':'20';Object.assign(x,{code:'XLU',date,holdingsAsOf:date,latestPriceMarketSession:session,cutoff:session+'T'+hour+':00:00Z',pricingBasis:'portfolio_fair_value_per_share',availableAt:new Date(Date.parse(date)+60*86400000).toISOString()});for(const h of x.holdings){h.corporateActionsCheckedThrough=date;Object.assign(h.price,{asOf:date,availableAt:x.availableAt,basis:x.pricingBasis});for(const f of ['shares','equity','revenue'])Object.assign(h[f],{asOf:session,availableAt:x.cutoff});}return x;}
test('all five verified non-trading quarter ends keep actual portfolio dates and financial cutoffs at the prior normal session',()=>{
 for(const [date,session]of Object.entries({'2022-12-31':'2022-12-30','2023-09-30':'2023-09-29','2023-12-31':'2023-12-29','2024-03-31':'2024-03-28','2024-06-30':'2024-06-28'})){
  const input=quarter(date,session),r=calculateETF(input).reading;assert.equal(r.date,date);assert.equal(r.latestPriceMarketSession,session);assert.equal(r.asOf,input.cutoff);
  const late=structuredClone(input);late.holdings[0].equity.availableAt=new Date(Date.parse(input.cutoff)+1000).toISOString();assert.throws(()=>calculateETF(late),/future/);
  const omitted=structuredClone(input);delete omitted.latestPriceMarketSession;assert.throws(()=>calculateETF(omitted),/verified quarter/);
  const wrong=structuredClone(input);wrong.latestPriceMarketSession=date;wrong.cutoff=date+'T20:00:00Z';assert.throws(()=>calculateETF(wrong),/verified quarter/);
 }
 const goodFriday=quarter('2024-03-31','2024-03-29');assert.throws(()=>calculateETF(goodFriday),/verified quarter/);
 const unpublished=quarter('2024-06-30','2024-06-28');unpublished.availableAt=unpublished.cutoff;assert.throws(()=>calculateETF(unpublished),/publication time/);
});
test('NextEra 2020 uses only verified four-for-one adjustment of original actual shares, not a new observed register',()=>{
 const x=quarter('2020-12-31'),h=x.holdings[0];h.symbol='NEE';Object.assign(h.shares,{asOf:'2020-09-30',availableAt:'2020-10-27T00:00:00-04:00',basis:'split_adjusted_actual_common_outstanding',value:1959074124,splitAdjustment:{baseValue:489768531,baseAsOf:'2020-09-30',effectiveDate:'2020-10-26',numerator:4,denominator:1,source:'filing'}});
 const r=calculateETF(x);assert.ok(r.reading.pb.value>0);assert.equal(r.reading.qualityFlags.eventReconstructedShares,1);assert.equal(r.quality.shareAgeDays.NEE,92);assert.equal(h.shares.asOf,'2020-09-30');
 for(const mutate of [y=>y.holdings[0].shares.value=489768531,y=>y.holdings[0].shares.asOf='2020-12-31',y=>y.holdings[0].symbol='OTHER',y=>y.code='XLE']){const bad=structuredClone(x);mutate(bad);assert.throws(()=>calculateETF(bad));}
});
test('only six audited utility issuer/quarter combinations accept official same-scope comparable revenue',()=>{
 for(const [symbol,date] of [['DTE','2021-12-31'],['EXC','2022-03-31'],['EXC','2022-06-30'],['PPL','2021-06-30'],['PPL','2021-09-30'],['PPL','2021-12-31']]){
  const x=quarter(date);x.holdings[0].symbol=symbol;x.holdings[0].revenue.basis='ttm_pro_forma_comparable';const r=calculateETF(x);assert.equal(r.reading.qualityFlags.comparableRevenue,1);assert.ok(r.reading.ps.value>0);
  const wrong=structuredClone(x);wrong.holdings[0].symbol='OTHER';assert.throws(()=>calculateETF(wrong),/Revenue must/);
 }
 const unknown=quarter('2026-06-30');unknown.holdings[0].symbol='EXC';unknown.holdings[0].revenue.basis='ttm_pro_forma_comparable';assert.throws(()=>calculateETF(unknown),/Revenue must/);
});
