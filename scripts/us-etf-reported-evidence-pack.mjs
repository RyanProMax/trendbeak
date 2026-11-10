import {gzipSync,gunzipSync}from'node:zlib';
import {reportedHash,reportedCanonical}from'./us-etf-reported-candidate.mjs';
export const REPORTED_EVIDENCE_NAMES=Object.freeze(['bundle','proofManifest','basket','methodReview','computation','mrvlBridge','availabilityReview','publicationEvidence','HPE','LITE','MCHP','riskReconciliation','riskMapping','capitalRisk','sourceReview']);
const LIMIT=4000000,COMPRESSED_LIMIT=1000000;
function content(artifacts){
 if(!artifacts||Object.keys(artifacts).length!==REPORTED_EVIDENCE_NAMES.length||REPORTED_EVIDENCE_NAMES.some(k=>!Buffer.isBuffer(artifacts[k])||artifacts[k].length===0||artifacts[k].length>1000000))throw Error('Exact bounded evidence artifact inventory required');
 const strings={};for(const k of REPORTED_EVIDENCE_NAMES){strings[k]=artifacts[k].toString('utf8');if(!Buffer.from(strings[k]).equals(artifacts[k]))throw Error('Evidence must preserve exact UTF-8 source bytes');}
 const raw=Buffer.from(reportedCanonical(strings));if(raw.length>LIMIT)throw Error('Evidence archive expanded bound exceeded');return raw;
}
/** Compress once for bounded durable reproduction. A later reviewer verifies
 * and retains these exact compressed bytes; it need not reproduce gzip output
 * across platforms or zlib versions. HTTP readers never expand this archive. */
export function packReportedEvidence(artifacts){
 const raw=content(artifacts),compressed=gzipSync(raw,{level:9});if(compressed.length>COMPRESSED_LIMIT)throw Error('Evidence compressed bound exceeded');
 return {encoding:'gzip-base64',scope:'reviewed_normalized_inputs_and_carrying_proofs_not_raw_filings',expandedBytes:raw.length,expandedSha256:reportedHash(raw),compressedSha256:reportedHash(compressed),data:compressed.toString('base64')};
}
export function unpackReportedEvidence(pack){
 if(!pack||pack.encoding!=='gzip-base64'||pack.scope!=='reviewed_normalized_inputs_and_carrying_proofs_not_raw_filings'||!Number.isSafeInteger(pack.expandedBytes)||pack.expandedBytes<=0||pack.expandedBytes>LIMIT||typeof pack.data!=='string'||pack.data.length>Math.ceil(COMPRESSED_LIMIT/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(pack.data))throw Error('Bounded exact evidence archive required');
 const compressed=Buffer.from(pack.data,'base64');if(compressed.length>COMPRESSED_LIMIT||compressed.toString('base64')!==pack.data||reportedHash(compressed)!==pack.compressedSha256)throw Error('Compressed evidence bytes changed');
 const raw=gunzipSync(compressed,{maxOutputLength:LIMIT});if(raw.length!==pack.expandedBytes||reportedHash(raw)!==pack.expandedSha256)throw Error('Expanded evidence bytes changed');
 const strings=JSON.parse(raw),artifacts=Object.fromEntries(Object.entries(strings).map(([k,v])=>{if(typeof v!=='string')throw Error('Explicit evidence source string required');return [k,Buffer.from(v)];}));
 if(!content(artifacts).equals(raw))throw Error('Evidence inventory or canonical representation changed');return artifacts;
}
