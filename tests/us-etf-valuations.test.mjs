import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateETF, commonEquity } from '../scripts/us-etf-valuations.mjs';
import { etfInput } from './us-etf-fixture.mjs';
test('fund uses original-weight harmonic means, not arithmetic average or ratio of weighted totals', () => {
  const input = etfInput(), before = structuredClone(input), r = calculateETF(input);
  assert.equal(r.reading.pb.value, 12.5); assert.equal(r.reading.ps.value, 5);
  assert.equal(r.reading.pb.coverage, 1); assert.equal(r.reading.pb.percentile, null);
  assert.equal(r.quality.shareAgeDays.AAA, 36); assert.deepEqual(input, before);
});
test('ordinary equity removes NCI and preferred exactly once', () => {
  assert.equal(commonEquity({ value: 120, basis: 'consolidated', noncontrollingInterest: 10, preferredEquity: 5 }), 105);
  assert.equal(commonEquity({ value: 110, basis: 'parent', preferredEquity: 5 }), 105);
  assert.equal(commonEquity({ value: 105, basis: 'common' }), 105);
  for (const fact of [{ value: 110, basis: 'parent', preferredEquity: 5, noncontrollingInterest: 10 }, { value: 105, basis: 'common', preferredEquity: 5 }, { value: 120, basis: 'consolidated', preferredEquity: 5 }, { value: 110, basis: 'parent' }]) assert.throws(() => commonEquity(fact));
});
test('missing values are not zero, negative PB is excluded independently of valid PS, and insufficient coverage is blank', () => {
  const input = etfInput(); input.holdings[0].weight = .985; input.holdings[1].weight = .015;
  input.holdings[1].equity.value = -1;
  let r = calculateETF(input); assert.equal(r.reading.pb.value, 10); assert.equal(r.reading.pb.coverage, .985); assert.equal(r.reading.pb.excludedWeight, .015); assert.equal(r.reading.ps.coverage, 1);
  input.holdings[1].equity = null; r = calculateETF(input); assert.equal(r.reading.pb.missingWeight, .015); assert.equal(r.reading.pb.excludedWeight, 0);
  input.holdings[0].weight = .97; input.holdings[1].weight = .03; r = calculateETF(input); assert.equal(r.reading.pb.value, null); assert.equal(r.reading.pb.percentile, null);
});
test('rejects hindsight, adjusted prices, weighted shares, corporate-action uncertainty and ambiguous fact bases', () => {
  for (const mutate of [
    x => x.holdings[0].equity.availableAt = '2026-11-05T21:01:00Z',
    x => x.holdings[0].price.asOf = '2026-11-04',
    x => x.holdings[0].price.basis = 'adjusted_close',
    x => x.holdings[0].shares.basis = 'weighted_average',
    x => x.holdings[0].shares.shareBasis = 'other',
    x => x.holdings[0].corporateActionsStatus = 'unresolved_split',
    x => x.holdings[0].corporateActionsStatus = 'unresolved_spinoff',
    x => x.holdings[0].corporateActionsStatus = 'unknown_typo',
    x => x.holdings[0].shares.asOf = '2024-01-01',
    x => x.holdings[0].revenue.basis = 'quarterly',
    x => x.holdings[0].revenue.source = 'unknown',
    x => x.holdingsAsOf = '2026-11-04',
    x => x.cutoff = '2026-11-05T20:00:00Z',
    x => x.holdings.push(x.holdings[0]),
    x => x.holdings[0].weight = 60,
    x => { x.holdings[0].shares = null; x.holdings[0].price.availableAt = '2027-01-01T00:00:00Z'; },
  ]) { const input = etfInput(); mutate(input); assert.throws(() => calculateETF(input)); }
});
test('missing holding weight reduces effective fund coverage instead of re-normalizing a sample to 100%', () => {
  const input = etfInput(); input.holdings.pop(); const r = calculateETF(input);
  assert.equal(r.reading.pb.coverage, .6); assert.equal(r.reading.pb.missingWeight, .4); assert.equal(r.reading.pb.value, null);
});

test('known negative equity qualifies as verified data, while ageing shares and incomplete action review stay explicit', () => { const x=etfInput(); x.holdings[1].equity.value=-100; x.holdings[0].shares.asOf='2026-07-17'; delete x.holdings[0].corporateActionsCheckedThrough; const r=calculateETF(x); assert.equal(r.reading.pb.value,10); assert.equal(r.reading.pb.coverage,.6); assert.equal(r.reading.pb.verifiedCoverage,1); assert.equal(r.reading.pb.excludedWeight,.4); assert.equal(r.quality.warnings.length,2); });
test('quarterly portfolio marks retain their real valuation date and late publication, with no hindsight in financials', () => {
  const x=etfInput(); x.date='2026-09-30'; x.cutoff='2026-09-30T20:00:00Z'; x.holdingsAsOf=x.date; x.availableAt='2026-11-05T21:01:00Z'; x.pricingBasis='portfolio_fair_value_per_share';
  for(const h of x.holdings) { h.price={...h.price,asOf:x.date,availableAt:x.availableAt,basis:x.pricingBasis}; for(const f of [h.shares,h.equity,h.revenue]) {f.asOf='2026-06-30';f.availableAt='2026-08-01T12:00:00Z';} }
  const r=calculateETF(x); assert.equal(r.reading.date,'2026-09-30');assert.equal(r.reading.availableDate,'2026-11-06');assert.equal(r.reading.pb.value,12.5);
  const noRelease=structuredClone(x);delete noRelease.availableAt;assert.throws(()=>calculateETF(noRelease),/publication time is required/);
  x.holdings[0].equity.availableAt='2026-10-01T12:00:00Z'; assert.throws(()=>calculateETF(x),/future/);
});

test('only explicit reviewed or standard-issuer estimate statuses admit capitalization', () => {
 for(const status of [undefined,'unverified','verified_all_comon','known_class_only']) {
  const x=etfInput(); x.holdings[0].shareClassStatus=status; const r=calculateETF(x);
  assert.equal(r.reading.qualityFlags.shareClassesUnreviewed,1);assert.equal(r.reading.pb.value,null);assert.equal(r.reading.ps.value,null);assert.equal(r.reading.pb.missingWeight,.6);assert.equal(r.reading.pb.verifiedCoverage,.4);
 }
 const x=etfInput();x.holdings[0].shareClassStatus='single_common_class_assumed_from_standard_issuer_fact';let r=calculateETF(x);assert.equal(r.reading.pb.value,12.5);assert.equal(r.reading.qualityFlags.shareClassesUnreviewed,1);
 x.holdings[0].shares.scope='class_only';r=calculateETF(x);assert.equal(r.reading.pb.value,null);
});
test('shared issuer capitalization sums listed classes once and uses economic proxy units only for other classes', () => {
 const x=etfInput(),a=x.holdings[0],b=x.holdings[1];
 const components=[{classId:'A',priceClassId:'A',price:{...a.price,value:100},shares:{...a.shares,value:10},economicUnitFactor:1},{classId:'C',priceClassId:'C',price:{...b.price,value:200},shares:{...b.shares,value:10},economicUnitFactor:1}];
 for(const h of x.holdings){h.issuerId='issuer';h.capitalizationScope='all_common_classes';h.capitalizationComponents=structuredClone(components);h.equity=structuredClone(a.equity);h.revenue=structuredClone(a.revenue);}
 let r=calculateETF(x);assert.equal(r.reading.pb.value,30);assert.equal(r.reading.ps.value,15);
 // A real class-A quote already includes its unit price; a second 1500x is invalid.
 x.holdings[0].capitalizationComponents[0].economicUnitFactor=1500;assert.throws(()=>calculateETF(x),/factor one/);
 x.holdings[0].capitalizationComponents[0].economicUnitFactor=1;
 for(const h of x.holdings)h.capitalizationComponents.push({classId:'B',priceClassId:'A',price:structuredClone(a.price),shares:{...a.shares,value:1},economicUnitFactor:1500,economicEquivalenceSource:'filing'});
 r=calculateETF(x);assert.ok(Math.abs(r.reading.pb.value-1530)<1e-9);assert.ok(Math.abs(r.reading.ps.value-765)<1e-9);
 delete x.holdings[0].capitalizationComponents[2].economicEquivalenceSource;assert.throws(()=>calculateETF(x),/equivalence/);
});
test('two holdings cannot assign conflicting full-company ratios to one issuer',()=>{const x=etfInput();for(const h of x.holdings)h.issuerId='same';assert.throws(()=>calculateETF(x),/One issuer/);});
test('only the reviewed Comcast comparable revenue basis is admitted, with an observation-level flag',()=>{
 const x=etfInput();x.code='XLC';x.holdings[0].symbol='CMCSA';x.holdings[0].revenue.basis='ttm_pro_forma_comparable';let r=calculateETF(x);assert.equal(r.reading.qualityFlags.comparableRevenue,1);assert.equal(r.reading.ps.value,5);
 x.holdings[0].symbol='OTHER';assert.throws(()=>calculateETF(x),/reviewed Comcast/);
 x.holdings[0].symbol='CMCSA';x.code='XLK';assert.throws(()=>calculateETF(x),/reviewed Comcast/);
});
test('Visa event reconstruction is a distinct sourced estimate, never accepted as generic actual shares',()=>{
 const x=etfInput();x.code='XLF';const h=x.holdings[0];h.symbol='V';h.issuerId='visa';h.capitalizationScope='all_common_classes';h.capitalizationComponents=[{classId:'all_common_A_equivalent',priceClassId:'A',economicUnitFactor:1,economicEquivalenceSource:'filing',price:h.price,shares:{...h.shares,basis:'event_reconstructed_common_equivalent',unit:'common_equivalent_shares'}}];
 let r=calculateETF(x);assert.equal(r.reading.qualityFlags.eventReconstructedShares,1);assert.equal(r.reading.pb.value,12.5);
 h.symbol='OTHER';assert.throws(()=>calculateETF(x));h.symbol='V';delete h.capitalizationComponents[0].economicEquivalenceSource;assert.throws(()=>calculateETF(x));
});
test('alternate holdings never replace the primary result; only comparable qualified alternatives get numeric deltas',()=>{
 const x=etfInput();x.sourceComparison={date:x.date,source:'holdings',observedAt:'2026-11-08T10:00:00Z',alternateSourceValues:{pb:10,ps:4},alternateCoverage:{pb:1,ps:.97}};const r=calculateETF(x);
 assert.equal(r.reading.pb.value,12.5);assert.equal(r.reading.ps.value,5);assert.equal(r.reading.sourceComparison.sourceConflict,true);assert.equal(r.reading.sourceComparison.alternateSourceValues.pb,10);assert.ok(Math.abs(r.reading.sourceComparison.deltaPercent.pb+20)<1e-10);assert.equal(r.reading.sourceComparison.alternateSourceValues.ps,null);assert.equal(r.reading.sourceComparison.deltaPercent.ps,null);
 x.sourceComparison.date='2026-11-04';assert.throws(()=>calculateETF(x),/same-date/);
});

test('HONA event pro forma and carve-out facts are explicitly sourced, flagged and narrowly allowed',()=>{
 const x=etfInput();x.code='XLI';const h=x.holdings[0];h.symbol='HONA';h.equity.basis='common_pro_forma_event_bridge';h.equity.value=-100;h.revenue.basis='ttm_carve_out_reported';
 const r=calculateETF(x);assert.equal(r.reading.qualityFlags.eventProForma,1);assert.equal(r.reading.pb.excludedWeight,.6);assert.equal(r.reading.pb.verifiedCoverage,1);assert.equal(r.reading.pb.value,20);assert.equal(r.reading.ps.value,5);
 h.equity.preferredEquity=10;assert.throws(()=>calculateETF(x),/twice/);delete h.equity.preferredEquity;
 h.symbol='OTHER';assert.throws(()=>calculateETF(x),/equity basis/);h.symbol='HONA';x.code='XLK';assert.throws(()=>calculateETF(x),/equity basis/);
});

test('FDXF is a second narrow sourced event bridge, while unresolved parents remain missing',()=>{
 const x=etfInput();x.code='XLI';
 for(const [i,symbol]of ['HONA','FDXF'].entries()) {const h=x.holdings[i];h.symbol=symbol;h.equity.basis='common_pro_forma_event_bridge';h.equity.value=-100;h.revenue.basis='ttm_carve_out_reported';}
 const r=calculateETF(x);assert.equal(r.reading.qualityFlags.eventProForma,2);assert.equal(r.reading.pb.value,null);assert.equal(r.reading.pb.excludedWeight,1);assert.equal(r.reading.ps.value,5);
 x.holdings[1].symbol='FDX';assert.throws(()=>calculateETF(x),/equity basis/);
 x.holdings[1].equity=null;x.holdings[1].revenue=null;x.holdings[1].shares=null;const missing=calculateETF(x);assert.equal(missing.reading.pb.value,null);assert.equal(missing.reading.ps.value,null);assert.equal(missing.reading.ps.missingWeight,.4);
});
