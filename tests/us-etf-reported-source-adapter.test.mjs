import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptReportedSourceV5,adaptReportedSourceV6,adaptReportedSourceV8} from '../scripts/us-etf-reported-source-adapter.mjs';
test('source adapters do not accept empty, fabricated or candidate-supplied PASS artifacts',()=>{
  for(const adapt of [adaptReportedSourceV5,adaptReportedSourceV6,adaptReportedSourceV8]){
    for(const args of [{},{bundleBytes:Buffer.from('{"wholePointAdmitted":true,"sourceComponentVerified":true}'),proofManifestBytes:Buffer.from('{"allHashesVerified":true}'),reviewBytes:Buffer.from('{}'),computationBytes:Buffer.from('{}')}])assert.throws(()=>adapt(args));
  }
});

import {reportedRiskAssessment,reportedMetricRows,reportedFieldAdmissions,reportedSourceNetting} from '../scripts/us-etf-reported-source-adapter.mjs';
import {reportedHarmonicArithmetic} from '../scripts/us-etf-reported-arithmetic.mjs';
const risks=['knownCapitalLag','knownBookScopeLag','reportedPerimeterLag'];
const unknown=()=>Object.fromEntries(risks.map(r=>[r,{status:'unknown',evidenceRefs:[],note:'Not reviewed'}]));
test('legacy false and missing scope mean unknown while disclosed true capital lag survives',()=>{
  for(const flag of [false,undefined]){
    const r=reportedRiskAssessment({capitalization:{knownCapitalLag:flag},scope:'no events'},new Map());
    for(const risk of risks)assert.equal(r[risk].status,'unknown');
  }
  assert.equal(reportedRiskAssessment({capitalization:{knownCapitalLag:true}},new Map()).knownCapitalLag.status,'known');
  assert.throws(()=>reportedRiskAssessment({},new Map(),{structuredRequired:true}));
});
test('structured known and none require manifest-bound evidence, never a guessed free-text disposition',()=>{
  const ref={path:'review.json',sha256:'a'.repeat(64)},manifest=new Map([[ref.sha256,ref]]),riskAssessment=unknown();
  riskAssessment.knownBookScopeLag={status:'known',evidenceRefs:[ref],note:'Acquired after dated book'};
  riskAssessment.reportedPerimeterLag={status:'none',evidenceRefs:[ref],note:'Bounded explicit assessment'};
  const r=reportedRiskAssessment({riskAssessment},manifest,{structuredRequired:true});assert.equal(r.knownBookScopeLag.status,'known');assert.equal(r.reportedPerimeterLag.status,'none');
  for(const broken of [{status:'none',evidenceRefs:[],note:'No evidence'},{status:'known',evidenceRefs:[{...ref,sha256:'b'.repeat(64)}],note:'Foreign root'},{status:false,evidenceRefs:[],note:'Boolean coercion'}])assert.throws(()=>reportedRiskAssessment({riskAssessment:{...riskAssessment,knownBookScopeLag:broken}},manifest));
});
test('PB and PS admissions stay independent in both directions and preserve denominator-specific unknown risk',()=>{
  const positions=[{securityId:'A',issuerId:'1',originalFundWeight:'1'}];
  const issuer={securityId:'A',issuerId:'1',capitalization:{capitalEstimate:'100',unlistedClassPriceProxy:false,unitScopePending:false},commonBook:{value:'-10'},revenue:{value:'10'}};
  const riskAssessment=unknown();riskAssessment.knownBookScopeLag={status:'known',evidenceRefs:[],note:'Pure downstream test, no source approval'};
  for(const admitted of ['pb','ps']){
    const components=new Map([['A',{issuer,admissions:{pb:admitted==='pb',ps:admitted==='ps'},riskAssessment}]]);
    for(const metric of ['pb','ps']){
      const rows=reportedMetricRows(positions,components,metric,{issuerInputs:[issuer]}),r=reportedHarmonicArithmetic(rows,{fullEquityWeight:'1'});
      assert.equal(r.coverages.verifiedInput.displayCoverage,metric===admitted?1:0);
      assert.equal(r.riskAssessments.knownBookScopeLag.states.known.displayCoverage,metric===admitted?1:0);
      assert.equal(r.riskAssessments.knownBookScopeLag.states.unknown.displayCoverage,metric===admitted?0:1);
      if(metric!==admitted)assert.equal(rows[0].denominator,null);
    }
  }
});
test('projection cannot cross-wire an admitted issuer into a different holding',()=>{
  const positions=[{securityId:'A',issuerId:'1',originalFundWeight:'1'}];
  assert.throws(()=>reportedMetricRows(positions,new Map([['A',{issuer:{securityId:'A',issuerId:'2'},admissions:{pb:true,ps:false},riskAssessment:unknown()}]]),'ps'));
});

test('independent field evidence does not require the other financial field or whole-source PASS',()=>{
  for(const verified of ['pb','ps']){
    const expected={pb:verified==='pb',ps:verified==='ps'};
    const issuer={sourceComponentVerified:false,commonBook:{verifiedInput:expected.pb,independentAuditVerified:expected.pb},revenue:{verifiedInput:expected.ps,independentAuditVerified:expected.ps}};
    assert.deepEqual(reportedFieldAdmissions(issuer,expected,{independentRequired:true}),expected);
    const other=verified==='pb'?'revenue':'commonBook';
    issuer[other].independentAuditVerified=true;
    assert.throws(()=>reportedFieldAdmissions(issuer,expected,{independentRequired:true}));
  }
});

import {readFile} from 'node:fs/promises';
test('ACN source netting uses only the exact audited same-date cover minus issuer-held shares',async()=>{
  const i=JSON.parse(await readFile('tests/fixtures/reported-common/acn-source-netting.json'));
  const manifest=new Map([[i.capitalization.classFacts[0].source.sha256,i.capitalization.classFacts[0].source]]);
  assert.equal(reportedSourceNetting(i,manifest),'611942109');
  const mutations={
    expectedEightHundredThousand:x=>{x.capitalization.shares='612742109';x.capitalization.sourceNetting.netExternalCommon='612742109';},
    expectedFiveMillion:x=>{x.capitalization.shares='616942109';x.capitalization.sourceNetting.netExternalCommon='616942109';},
    differentTreasuryDate:x=>x.capitalization.sourceNetting.asOf='2026-05-31',
    falseButBalancedTreasury:x=>{x.capitalization.sourceNetting.lessIssuerHeldSameDate='50568101';x.capitalization.sourceNetting.netExternalCommon='616942109';x.capitalization.shares='616942109';},
    arithmeticMismatch:x=>x.capitalization.sourceNetting.grossReportedCover='667510211',
    excessDeduction:x=>x.capitalization.sourceNetting.lessIssuerHeldSameDate='700000000',
    negativeNet:x=>{x.capitalization.sourceNetting.netExternalCommon='-1';x.capitalization.shares='-1';},
    zeroNet:x=>{x.capitalization.sourceNetting.netExternalCommon='0';x.capitalization.shares='0';},
    noOriginal:x=>delete x.capitalization.sourceNetting.proof,
    unsupportedOriginal:x=>x.capitalization.sourceNetting.proof.text='This declares source netting without dated facts.',
    differentOriginal:x=>x.capitalization.sourceNetting.proof.source.sha256='b'.repeat(64),
    wrongEntity:x=>x.issuerId='1',
    splitInsteadOfNetting:x=>x.capitalization.eventBridge={numerator:2,denominator:1},
    coverCountAlreadyNetted:x=>x.capitalization.originalReportedShares='611942109',
    classDifferentDate:x=>x.capitalization.classFacts[0].asOf='2026-05-31',
  };
  for(const [name,mutate]of Object.entries(mutations)){const x=structuredClone(i);mutate(x);assert.throws(()=>reportedSourceNetting(x,manifest),name);}
  assert.throws(()=>reportedSourceNetting(i,new Map()));
});
