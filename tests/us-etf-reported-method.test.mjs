import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reportedCoverageDiagnostic,verifyReportedMethodArtifacts,REPORTED_METHOD_ID,REPORTED_SCOPE_REVISION} from '../scripts/us-etf-reported-method.mjs';
import {reportedHash} from '../scripts/us-etf-reported-candidate.mjs';
const row=(id,weight,denominator)=>({securityId:id,issuerId:id,weight,capitalization:'100',denominator,identityAdmitted:true,denominatorAdmitted:true,riskAssessment:{knownCapitalLag:{status:'unknown'},knownBookScopeLag:{status:'unknown'},reportedPerimeterLag:{status:'unknown'}},commonClassPriceProxy:false,unitBridgeUnresolved:false});

test('all five independently provided v2 fixtures preserve verified-input gate and positive subset ratio',async()=>{
  const bytes=await readFile('tests/fixtures/reported-common/coverage-gate-v2.json');
  assert.equal(reportedHash(bytes),'ebfe0e29ea7b7eab11cb3462c71873b70502f4dc345a79056af54c7a610e8cba');
  for(const f of JSON.parse(bytes).fixtures){
    const rows=[];if(Number(f.positiveWeight)>0)rows.push(row('positive',f.positiveWeight,'10'));if(Number(f.verifiedNonpositiveWeight)>0)rows.push(row('nonpositive',f.verifiedNonpositiveWeight,'-10'));
    const r=reportedCoverageDiagnostic(rows,{fullEquityWeight:f.fullStockWeight});
    assert.equal(r.coverageGatePassed,f.expectedDataCoverageGate,f.name);
    assert.equal(r.eligibleValue!==null,f.expectedMayHaveFinitePositiveValue,f.name);
    assert.equal(r.coverages.positive.displayCoverage,Number(f.positiveCoverage));
    assert.equal(r.coverages.verifiedNonpositive.displayCoverage,Number(f.verifiedNonpositiveCoverage));
    assert.equal(r.coverages.verifiedInput.displayCoverage,Number(f.verifiedInputCoverage));
    assert.equal(r.publishable,false);assert.equal(r.sourceAdmissionPerformed,false);assert.equal(r.wholeObservationApproved,false);
  }
});
test('exact sub-98% gate fails although a binary display may round to98%',()=>{
  const r=reportedCoverageDiagnostic([row('A','0.979999999999999999999','10')],{fullEquityWeight:'1'});
  assert.equal(r.coverageGatePassed,false);assert.equal(r.eligibleValue,null);
});
test('independent method identity cannot masquerade as legacy strict or a whole observation approval',()=>{
  const r=reportedCoverageDiagnostic([row('A','1','10')],{fullEquityWeight:'1'});
  assert.equal(r.methodVersion,REPORTED_METHOD_ID);assert.equal(r.scopeRevision,REPORTED_SCOPE_REVISION);assert(r.comparisonKey.includes(REPORTED_SCOPE_REVISION));assert.equal(r.rank,null);assert.equal(r.percentile,null);assert.equal(r.publishable,false);
});
test('missing, tampered, or superseded method artifacts cannot pass exact reviewed binding',()=>{
  for(const args of [{},{reviewBytes:Buffer.from('{}'),computationBytes:Buffer.from('{}')},{reviewBytes:Buffer.alloc(100001),computationBytes:Buffer.from('{}')}])assert.throws(()=>verifyReportedMethodArtifacts(args));
});
