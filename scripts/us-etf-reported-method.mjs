// Separate offline method identity. No historical-series merge or write path.
import policy from '../data/us-etf-reported-method-policy.json' with {type:'json'};
import {reportedHash} from './us-etf-reported-candidate.mjs';
import {reportedHarmonicArithmetic} from './us-etf-reported-arithmetic.mjs';

export const REPORTED_METHOD_ID = policy.methodVersion;
export const REPORTED_SCOPE_REVISION = policy.scopeRevision;
export const REPORTED_COMPARISON_KEY = [REPORTED_METHOD_ID,REPORTED_SCOPE_REVISION,'retrospective_nport_fair_value','reported_operating_ttm','positive_subset_harmonic_verified_coverage_v2'].join('|');

export function verifyReportedMethodArtifacts({reviewBytes,computationBytes}) {
  for(const [bytes,expected] of [[reviewBytes,policy.methodReviewSha256],[computationBytes,policy.computationContractSha256]]) {
    if(!Buffer.isBuffer(bytes)||bytes.length>100000||reportedHash(bytes)!==expected)throw Error('Exact reviewed v2 method artifacts required');
  }
  const computation=JSON.parse(computationBytes);
  if(computation.schema!=='reported-common-computation-contract-v2'||computation.legacyStrictChanged!==false||computation.capitalField!==policy.capitalQuantity)throw Error('Method contract identity mismatch');
  return {methodVersion:REPORTED_METHOD_ID,scopeRevision:REPORTED_SCOPE_REVISION,methodReviewSha256:policy.methodReviewSha256,computationContractSha256:policy.computationContractSha256};
}

/** This applies the exact arithmetic coverage rule, not source or observation
 * admission. Even complete fixture arithmetic cannot authorize a release. */
export function reportedCoverageDiagnostic(rows,{fullEquityWeight}) {
  const arithmetic=reportedHarmonicArithmetic(rows,{fullEquityWeight});
  const coverage=arithmetic.coverages.verifiedInput.coverage,minimum=policy.minimumVerifiedCoverage;
  const coverageGatePassed=BigInt(coverage.numerator)*BigInt(minimum.denominator)>=BigInt(minimum.numerator)*BigInt(coverage.denominator);
  const eligibleValue=coverageGatePassed&&arithmetic.coveredPositiveMultiple!==null&&Number.isFinite(arithmetic.coveredPositiveMultiple)&&arithmetic.coveredPositiveMultiple>0?arithmetic.coveredPositiveMultiple:null;
  return {
    ...arithmetic,
    methodVersion:REPORTED_METHOD_ID,
    scopeRevision:REPORTED_SCOPE_REVISION,
    comparisonKey:REPORTED_COMPARISON_KEY,
    coverageGate:policy.coverageGate,
    coverageGatePassed,
    eligibleValue,
    sourceAdmissionPerformed:false,
    methodArtifactsVerified:false,
    wholeObservationApproved:false,
    publishable:false,
  };
}

export function reportedMethodDiagnostic(rows,{fullEquityWeight,reviewBytes,computationBytes}) {
  const method=verifyReportedMethodArtifacts({reviewBytes,computationBytes});
  return {...reportedCoverageDiagnostic(rows,{fullEquityWeight}),...method,methodArtifactsVerified:true};
}
