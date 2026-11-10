// Pure mechanical checks below the pinned source-review root. These helpers do
// not establish original-source authenticity or authorize an observation.
import {reportedHash} from './us-etf-reported-candidate.mjs';
export const REPORTED_AVAILABILITY_REVIEW_SHA='109123bbd713ea3ddcb1aaa2e17809009f30772274b6bc8f5e3d1806653914b4';
const instant=x=>typeof x==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const nyParts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
export function verifyReportedAvailabilityReview(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>100000||reportedHash(bytes)!==REPORTED_AVAILABILITY_REVIEW_SHA)throw Error('Exact reviewed source-availability policy required');
  return JSON.parse(bytes);
}
/** effectiveAvailableAt is independently typed. The retained old conservative
 * diagnostic is never rewritten to make an after-cutoff source appear usable. */
export function reportedEffectiveAvailability(metadata,{cutoff,sourceManifest}){
  if(!instant(cutoff)||!(sourceManifest instanceof Map))throw Error('Explicit close instant and reviewed manifest required');
  const p=metadata,o=p?.officialSubmissions,e=o?.entry;
  if(!o||typeof o.path!=='string'||!sourceManifest.has(o.sha256)||!Number.isSafeInteger(o.rowIndex)||o.rowIndex<0||!e||!/^\d{10}-\d{2}-\d{6}$/.test(e.accessionNumber??'')||typeof e.primaryDocument!=='string'||!e.primaryDocument||!day(e.filingDate)||!instant(p.effectiveAvailableAt)||!instant(p.conservativeAvailableAt))throw Error('Original accession metadata and typed availability required');
  if(p.availabilityBasis==='original_sec_acceptance'){
    if(!instant(e.acceptanceDateTime)||!instant(p.acceptedAt)||Date.parse(e.acceptanceDateTime)!==Date.parse(p.acceptedAt)||Date.parse(e.acceptanceDateTime)!==Date.parse(p.effectiveAvailableAt)||Date.parse(p.conservativeAvailableAt)<Date.parse(p.acceptedAt))throw Error('Exact original acceptance instant must bind effective availability');
  }else if(p.availabilityBasis==='conservative_next_day_policy'){
    if(e.acceptanceDateTime!==null&&e.acceptanceDateTime!==undefined||p.acceptedAt!==null&&p.acceptedAt!==undefined||Date.parse(p.effectiveAvailableAt)!==Date.parse(p.conservativeAvailableAt))throw Error('Fallback requires missing exact acceptance, not an override');
    const parts=nyParts(p.effectiveAvailableAt),next=new Date(Date.parse(e.filingDate+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    if(`${parts.year}-${parts.month}-${parts.day}`!==next||`${parts.hour}:${parts.minute}:${parts.second}`!=='00:00:00')throw Error('Conservative availability must be next calendar midnight in New York');
  }else throw Error('Unknown source-availability basis');
  if(Date.parse(p.effectiveAvailableAt)>Date.parse(cutoff))throw Error('Source was not publicly available by observation close');
  return {accession:e.accessionNumber,availableAt:new Date(p.effectiveAvailableAt).toISOString(),basis:p.availabilityBasis};
}
