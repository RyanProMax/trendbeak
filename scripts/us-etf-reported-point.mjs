// Reproducible point candidate. An exact evidence/source computation is not a
// release approval; only a separately reviewed registry can seal a snapshot.
import {reportedHash,reportedCanonical}from'./us-etf-reported-candidate.mjs';
import {adaptReportedSourceV9R4}from'./us-etf-reported-source-adapter.mjs';
import {packReportedEvidence,unpackReportedEvidence}from'./us-etf-reported-evidence-pack.mjs';
import {prepareReportedReading}from'./us-etf-reported-reading.mjs';
import {REPORTED_METHOD_ID,REPORTED_SCOPE_REVISION}from'./us-etf-reported-method.mjs';
export const REPORTED_POINT_KEY=`valuation-method/US/XLK/${REPORTED_METHOD_ID}/${REPORTED_SCOPE_REVISION}/2026-06-30`;
export function reportedArtifactArguments(a){return {bundleBytes:a.bundle,proofManifestBytes:a.proofManifest,basketBytes:a.basket,reviewBytes:a.methodReview,computationBytes:a.computation,mrvlBridgeBytes:a.mrvlBridge,availabilityReviewBytes:a.availabilityReview,publicationEvidenceBytes:a.publicationEvidence,riskReconciliationBytes:a.riskReconciliation,riskMappingBytes:a.riskMapping,capitalRiskBytes:a.capitalRisk,carryingProofs:{HPE:a.HPE,LITE:a.LITE,MCHP:a.MCHP}};}
function reproduce(evidence,{preparedAt}){
 const artifacts=unpackReportedEvidence(evidence),inputHash=reportedHash(artifacts.bundle);
 // Final source approval is separate from the later exact code/release review.
 if(inputHash!=='dab579516f7ffbfe85b872267306ff786eedc5d573d289e99abdbdafe31d21b1')throw Error('Unreviewed source candidate root');
 const sourceReviewSha256=reportedHash(artifacts.sourceReview),review=JSON.parse(artifacts.sourceReview);
 if(sourceReviewSha256!=='dc568d532b91271c18356888d20dd5fc3e0b5868ff7c4a56f016548d775dc11f'||review.schema!=='june-fullpoint-v9-integrated-independent-review-v1'||review.finalFrozenEngineSHA256!==inputHash||review.decision!=='PASS_FOR_DECLARED_RETROSPECTIVE_REPORTED_DATED_COMMON_METHOD'||review.reviewState!=='FINAL_FROZEN'||review.candidateFlagsUnmodified!==true||review.notUnqualifiedCurrentMarketOrTradingSignalApproval!==true)throw Error('Exact final independent whole-point source review required');
 const diagnostic=adaptReportedSourceV9R4(reportedArtifactArguments(artifacts));
 if(!diagnostic.referenceClosureComplete||diagnostic.positions.length!==74||diagnostic.metrics.pb.eligibleValue===null&&diagnostic.metrics.ps.eligibleValue===null)throw Error('Incomplete point cannot form a release-review candidate');
 const projection=prepareReportedReading(diagnostic,{preparedAt}),metrics={};
 for(const k of ['pb','ps']){const m=diagnostic.metrics[k];metrics[k]={coveredPositiveMultipleExact:m.coveredPositiveMultipleExact,positiveWeight:m.positiveWeight,weightedReciprocal:m.weightedReciprocal,coverages:m.coverages,riskAssessments:m.riskAssessments,classifications:m.classifications};}
 return {schema:'reported-common-point-candidate-v1',source:'self_us_etf_reported_common',code:'XLK',methodVersion:REPORTED_METHOD_ID,scopeRevision:REPORTED_SCOPE_REVISION,economicDate:'2026-06-30',preparedAt,sourceBundleSha256:inputHash,sourceReviewSha256,proofManifestSha256:diagnostic.proofManifestSha256,methodReviewSha256:diagnostic.methodReviewSha256,evidence,preparedReading:projection.preparedReading,readingSha256:projection.readingSha256,calculation:metrics,sourceDocumentsLocallyVerified:false,wholeObservationApproved:false,publishable:false};
}
export function buildReportedPointCandidate(artifacts,{preparedAt}){
 const candidate=reproduce(packReportedEvidence(artifacts),{preparedAt}),payload=reportedCanonical(candidate);if(Buffer.byteLength(payload)>1800000)throw Error('Point candidate exceeds bound');return {candidate,payload,candidateSha256:reportedHash(payload),readingSha256:candidate.readingSha256};
}
export function verifyReportedPointCandidate(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>1800000)throw Error('Bounded point candidate bytes required');const supplied=JSON.parse(bytes);
 if(supplied.schema!=='reported-common-point-candidate-v1')throw Error('Point candidate schema mismatch');const candidate=reproduce(supplied.evidence,{preparedAt:supplied.preparedAt}),payload=reportedCanonical(candidate);
 if(!Buffer.from(payload).equals(bytes))throw Error('Candidate fields do not reproduce from exact evidence');return {candidate,payload,candidateSha256:reportedHash(payload),readingSha256:candidate.readingSha256};
}
