// Bounded projection only; never a source, whole-point or deployment approval.
import {reportedCanonical,reportedHash} from './us-etf-reported-candidate.mjs';
import {REPORTED_METHOD_ID,REPORTED_SCOPE_REVISION}from'./us-etf-reported-method.mjs';
function range(issuers,field){
 const dates=issuers.filter(i=>field==='capitalization'||i[field]?.verifiedInput===true).map(i=>i[field]?.asOf).sort();
 if(!dates.length||dates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d>'2026-06-30'))throw Error('Source date range must come from admitted fields');
 return {first:dates[0],last:dates.at(-1)};
}
export function prepareReportedReading(diagnostic,{preparedAt}){
 if(!diagnostic||diagnostic.code!=='XLK'||diagnostic.date!=='2026-06-30'||diagnostic.methodVersion!==REPORTED_METHOD_ID||diagnostic.scopeRevision!==REPORTED_SCOPE_REVISION||diagnostic.publicAvailableAt!=='2026-08-28T16:30:53.000Z'||diagnostic.financialCutoff!=='2026-06-30T20:00:00.000Z'||diagnostic.wholeObservationApproved!==false||diagnostic.publishable!==false||!Array.isArray(diagnostic.originalIssuerInputsPreserved)||typeof preparedAt!=='string'||!Number.isFinite(Date.parse(preparedAt))||new Date(preparedAt).toISOString()!==preparedAt||preparedAt<diagnostic.publicAvailableAt)throw Error('Exact retrospective diagnostic and canonical preparation time required');
 const metrics={};
 for(const metric of ['pb','ps']){
  const d=diagnostic.metrics[metric],c=d.coverages,q=c.verifiedInput.coverage;
  const gate=BigInt(q.numerator)*100n>=BigInt(q.denominator)*98n;
  if(gate!==d.coverageGatePassed||d.publishable!==false||d.wholeObservationApproved!==false)throw Error('Exact metric coverage and nonpublishing diagnostic required');
  const risks={};for(const [name,key]of [['capitalLag','knownCapitalLag'],['bookScopeLag','knownBookScopeLag'],['incomePerimeterLag','reportedPerimeterLag']]){const s=d.riskAssessments[key].states;risks[name]={known:s.known.displayCoverage,unknown:s.unknown.displayCoverage};}
  metrics[metric]={value:gate?d.eligibleValue:null,verifiedCoverage:c.verifiedInput.displayCoverage,verifiedCoverageExact:q,positiveCoverage:c.positive.displayCoverage,nonpositiveCoverage:c.verifiedNonpositive.displayCoverage,missingCoverage:c.missing.displayCoverage,risks,rank:null,percentile:null};
 }
 const inputs=diagnostic.originalIssuerInputsPreserved;
 const reading={code:'XLK',methodVersion:REPORTED_METHOD_ID,scopeRevision:REPORTED_SCOPE_REVISION,economicDate:diagnostic.date,holdingsAsOf:diagnostic.date,publicAvailableAt:diagnostic.publicAvailableAt,financialCutoff:diagnostic.financialCutoff,preparedAt,estimated:true,retrospectiveReconstruction:true,isCurrentFundHoldings:false,isCurrentFundNAV:false,historicalRankEligible:false,mayRepresentContemporaneousTradableSignal:false,pricingBasis:'retrospective_nport_fair_value',sourceDateRanges:{capital:range(inputs,'capitalization'),book:range(inputs,'commonBook'),revenue:range(inputs,'revenue')},metrics};
 const preparedReading=reportedCanonical(reading);
 if(Buffer.byteLength(preparedReading)>4096)throw Error('Prepared reading exceeds fixed reader bound');
 return {reading,preparedReading,readingSha256:reportedHash(Buffer.from(preparedReading)),bytes:Buffer.byteLength(preparedReading),publishable:false,wholeObservationApproved:false};
}
