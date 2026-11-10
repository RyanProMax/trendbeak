import policy from'../data/us-etf-reported-approved-points.json'with{type:'json'};
import{reportedHash,reportedCanonical}from'./us-etf-reported-candidate.mjs';
import{verifyReportedPointCandidate,REPORTED_POINT_KEY}from'./us-etf-reported-point.mjs';
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
/** The production CLI consumes only the checked-in exact approval roots. The
 * optional approved argument is for isolated tests, not a user/API parameter. */
export function prepareReportedSnapshot({candidateBytes,registry,approved=policy.entries,now=Date.now()}){
 const keys=['schema','key','candidateSha256','sourceBundleSha256','sourceReviewSha256','releaseReviewSha256','approvedAt'];
 if(policy.schema!=='reviewed-reported-common-points-v1'||!registry||Object.keys(registry).some(k=>!keys.includes(k))||Object.keys(registry).length!==keys.length||registry.schema!=='reported-common-release-review-v1'||registry.key!==REPORTED_POINT_KEY||!instant(registry.approvedAt)||!Number.isFinite(now)||Date.parse(registry.approvedAt)>now||!['candidateSha256','sourceBundleSha256','sourceReviewSha256','releaseReviewSha256'].every(k=>sha(registry[k])))throw Error('Exact whole-point release review required');
 const registrySha256=reportedHash(registry);
 if(!Array.isArray(approved)||!approved.some(a=>a.candidateSha256===registry.candidateSha256&&a.registrySha256===registrySha256&&a.reviewSha256===registry.releaseReviewSha256))throw Error('Point is not in trusted release approval roots');
 const p=verifyReportedPointCandidate(candidateBytes),c=p.candidate;
 if(p.candidateSha256!==registry.candidateSha256||c.sourceBundleSha256!==registry.sourceBundleSha256||c.sourceReviewSha256!==registry.sourceReviewSha256||c.preparedAt>registry.approvedAt)throw Error('Release review does not bind this exact candidate');
 const checkpoint={schema:'reported-common-snapshot-v1',source:'self_us_etf_reported_common',code:c.code,methodVersion:c.methodVersion,scopeRevision:c.scopeRevision,economicDate:c.economicDate,candidate:c,registry,preparedReading:c.preparedReading};
 const payload=reportedCanonical(checkpoint);if(Buffer.byteLength(payload)>1800000)throw Error('Reported checkpoint exceeds bound');
 return {key:REPORTED_POINT_KEY,payload,payloadSha256:reportedHash(payload),candidateSha256:p.candidateSha256,registrySha256,readingSha256:p.readingSha256,preparedReading:c.preparedReading};
}
