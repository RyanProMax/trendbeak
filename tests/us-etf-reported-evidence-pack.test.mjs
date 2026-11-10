import test from'node:test';import assert from'node:assert/strict';import {packReportedEvidence,unpackReportedEvidence,REPORTED_EVIDENCE_NAMES}from'../scripts/us-etf-reported-evidence-pack.mjs';
const fixture=()=>Object.fromEntries(REPORTED_EVIDENCE_NAMES.map(n=>[n,Buffer.from(JSON.stringify({fixture:n,unicode:'原始字段'}))]));
test('bounded evidence archive retains every original byte without a source-approval claim',()=>{const a=fixture(),p=packReportedEvidence(a),b=unpackReportedEvidence(p);assert(!p.scope.includes('all_original'));for(const n of REPORTED_EVIDENCE_NAMES)assert(a[n].equals(b[n]));});
test('archive corruption, metadata drift, invalid UTF8 and missing artifacts fail closed',()=>{
 for(const mutate of [p=>p.data=p.data.slice(0,-4)+'AAAA',p=>p.expandedBytes++,p=>p.expandedSha256='a'.repeat(64),p=>p.compressedSha256='a'.repeat(64),p=>p.expandedBytes=4000001,p=>p.data='!invalid']){const p=packReportedEvidence(fixture());mutate(p);assert.throws(()=>unpackReportedEvidence(p));}
 const a=fixture();delete a.HPE;assert.throws(()=>packReportedEvidence(a));const b=fixture();b.HPE=Buffer.from([0xff]);assert.throws(()=>packReportedEvidence(b));
});
