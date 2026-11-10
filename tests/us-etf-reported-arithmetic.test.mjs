import test from 'node:test';
import assert from 'node:assert/strict';
import {reportedDecimal,reportedHarmonicArithmetic as calculate} from '../scripts/us-etf-reported-arithmetic.mjs';
const row=(id,weight,capitalization='100',denominator='10',extra={})=>({securityId:id,issuerId:id,weight,capitalization,denominator,identityAdmitted:true,denominatorAdmitted:true,riskAssessment:{knownCapitalLag:{status:'unknown'},knownBookScopeLag:{status:'unknown'},reportedPerimeterLag:{status:'unknown'}},commonClassPriceProxy:false,unitBridgeUnresolved:false,...extra});
const run=(rows,total='1')=>calculate(rows,{fullEquityWeight:total});
test('exact decimals retain sub-threshold evidence without rounding or selecting an unresolved gate',()=>{
  const r=run([row('A','0.979999999999999999999'),row('B','0.020000000000000000001',null)]);
  assert.deepEqual(r.coverages.positive.coverage,{numerator:'979999999999999999999',denominator:'1000000000000000000000'});
  assert.equal(r.coverageGate,null);assert.equal(r.coverageGatePassed,null);assert.equal(r.publishable,false);
  assert.equal(r.coveredPositiveMultiple,10);
});
test('positive harmonic subset is normalized, nonpositive is observed and cannot cancel reciprocals',()=>{
  const r=run([row('A','0.5'),row('B','0.3','100','20'),row('C','0.1','100','-10'),row('D','0.1','100','0')]);
  assert.deepEqual(r.coveredPositiveMultipleExact,{numerator:'80',denominator:'11'});
  assert.equal(r.coverages.positive.displayCoverage,.8);assert.equal(r.coverages.verifiedNonpositive.displayCoverage,.2);
  assert.equal(r.coverages.verifiedInput.displayCoverage,1);assert.equal(r.coverages.missing.displayCoverage,0);
});
test('missing stays missing and incomplete inventories retain the complete denominator',()=>{
  const r=run([row('A','0.4'),row('B','0.2',null),row('C','0.1','100',null)]);
  assert.equal(r.coverages.positive.displayCoverage,.4);assert.equal(r.coverages.missing.displayCoverage,.6);assert.equal(r.coverages.unrepresented.displayCoverage,.3);
  assert.equal(r.coveredPositiveMultiple,10);
});
test('unknown issuers retain explicit null identity and missing original weight',()=>{
  const r=run([row('A','1',null,null,{issuerId:null,identityAdmitted:false,denominatorAdmitted:false})]);assert.equal(r.coverages.missing.displayCoverage,1);assert.equal(r.coveredPositiveMultiple,null);
});
test('known ordinary capital lag and perimeter lag do not secretly erase inputs; unresolved units do',()=>{
  const r=run([row('A','0.5','100','10',{riskAssessment:{knownCapitalLag:{status:'known'},knownBookScopeLag:{status:'unknown'},reportedPerimeterLag:{status:'known'}},commonClassPriceProxy:true}),row('B','0.5','100','10',{unitBridgeUnresolved:true})]);
  assert.equal(r.coverages.knownCapitalLag.displayCoverage,.5);assert.equal(r.coverages.reportedPerimeterLag.displayCoverage,.5);assert.equal(r.coverages.commonClassPriceProxy.displayCoverage,.5);assert.equal(r.coverages.missing.displayCoverage,.5);
});
test('two held common classes use one issuer ratio without adding issuer capital twice',()=>{
  const r=run([row('A','0.4','300','30',{issuerId:'ISSUER'}),row('B','0.6','300','30',{issuerId:'ISSUER'})]);assert.equal(r.coveredPositiveMultiple,10);
  assert.throws(()=>run([row('A','0.4','300','30',{issuerId:'ISSUER'}),row('B','0.6','100','30',{issuerId:'ISSUER'})]));
});
test('all-nonpositive is not missing and cannot manufacture a multiple',()=>{
  const r=run([row('A','1','100','-1')]);assert.equal(r.coveredPositiveMultiple,null);assert.equal(r.coverages.verifiedInput.displayCoverage,1);assert.equal(r.coverages.verifiedNonpositive.displayCoverage,1);assert.equal(r.coverages.missing.displayCoverage,0);
});
test('verified nonpositive does not consume unused capital, but wrong identity or unknown book scope stays missing',()=>{
  for(const numerator of [null,'0','-1']){
    const r=run([row('A','1',numerator,'-1',{unitBridgeUnresolved:true})]);assert.equal(r.coverages.verifiedNonpositive.displayCoverage,1);assert.equal(r.coveredPositiveMultiple,null);assert.equal(r.coverages.unresolvedUnitBridge.displayCoverage,1);
  }
  for(const extra of [{identityAdmitted:false},{denominatorAdmitted:false}]){
    const r=run([row('A','1',null,'-1',extra)]);assert.equal(r.coverages.verifiedNonpositive.displayCoverage,0);assert.equal(r.coverages.missing.displayCoverage,1);
  }
});
test('bounded decimal and identity errors fail rather than coercing inputs',()=>{
  for(const v of [1,NaN,'NaN','Infinity','1e999','-','', '0x10'])assert.throws(()=>reportedDecimal(v));
  for(const rows of [[row('A','1.01')],[row('A','0.5'),row('A','0.5')],[row('A','1','0')],[{...row('A','1'),capitalization:undefined}],[row('A','1','100','10',{riskAssessment:undefined})]])assert.throws(()=>run(rows));
  assert.deepEqual(reportedDecimal('12.30e2'),{n:1230n,d:1n});
});
test('many exact issuer fractions do not overflow merely because reduced integers are large',()=>{
  const rows=Array.from({length:100},(_,i)=>row('I'+i,'0.01',String(1000000000001+2*i),'100000000000'));
  const r=run(rows);assert(Number.isFinite(r.coveredPositiveMultiple));assert(r.coveredPositiveMultiple>10&&r.coveredPositiveMultiple<10.000001);assert.equal(r.coverages.verifiedInput.displayCoverage,1);
});
test('risk assessments partition the original basket and unknown never appears as zero lag',()=>{
  const a={knownCapitalLag:{status:'none'},knownBookScopeLag:{status:'known'},reportedPerimeterLag:{status:'unknown'}};
  const b={knownCapitalLag:{status:'known'},knownBookScopeLag:{status:'none'},reportedPerimeterLag:{status:'none'}};
  const r=run([row('A','0.4','100','10',{riskAssessment:a}),row('B','0.3','100','10',{riskAssessment:b}),row('C','0.2','100',null,{denominatorAdmitted:false,riskAssessment:b})]);
  assert.equal(r.riskAssessments.knownCapitalLag.states.known.displayCoverage,.3);
  assert.equal(r.riskAssessments.knownCapitalLag.states.none.displayCoverage,.4);
  assert.equal(r.riskAssessments.knownCapitalLag.states.unknown.displayCoverage,.3);
  assert.equal(r.riskAssessments.knownCapitalLag.knownLagCoverage,null);
  assert.equal(r.riskAssessments.knownBookScopeLag.states.known.displayCoverage,.4);
  assert.equal(r.riskAssessments.reportedPerimeterLag.states.unknown.displayCoverage,.7);
  for(const risks of Object.values(r.riskAssessments)){assert.equal(risks.complete,false);assert(Math.abs(Object.values(risks.states).reduce((s,x)=>s+x.displayCoverage,0)-1)<1e-15);}
});
test('explicit fully assessed absence is distinct from unassessed',()=>{
  const riskAssessment=Object.fromEntries(['knownCapitalLag','knownBookScopeLag','reportedPerimeterLag'].map(k=>[k,{status:'none'}]));
  const r=run([row('A','1','100','10',{riskAssessment})]);
  for(const assessed of Object.values(r.riskAssessments)){assert.equal(assessed.complete,true);assert.equal(assessed.knownLagCoverage,0);assert.equal(assessed.states.unknown.displayCoverage,0);}
  assert.throws(()=>run([row('A','1','100','10',{riskAssessment:{...riskAssessment,reportedPerimeterLag:{status:false}}})]));
});
