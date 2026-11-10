import test from 'node:test';import assert from 'node:assert/strict';
import {reportedEffectiveAvailability as validate,verifyReportedAvailabilityReview}from'../scripts/us-etf-reported-evidence.mjs';
const sha='a'.repeat(64),sourceManifest=new Map([[sha,{path:'test-official-metadata.json',sha256:sha}]]);
const cutoff='2026-06-30T20:00:00Z';
const exact=at=>({officialSubmissions:{path:'test-official-metadata.json',sha256:sha,rowIndex:0,entry:{accessionNumber:'0000000001-26-000001',primaryDocument:'fixture.htm',filingDate:'2026-06-30',acceptanceDateTime:at}},acceptedAt:at,conservativeAvailableAt:'2026-07-01T00:00:00-04:00',effectiveAvailableAt:at,availabilityBasis:'original_sec_acceptance'});
const run=p=>validate(p,{cutoff,sourceManifest});
test('verified same-day acceptance before or at close is usable despite conservative next-day diagnostic',()=>{
 for(const at of ['2026-06-30T11:35:25Z','2026-06-30T16:00:00-04:00']){const p=exact(at),before=structuredClone(p),r=run(p);assert.equal(r.availableAt,new Date(at).toISOString());assert.deepEqual(p,before);}
});
test('after-close and substituted acceptance times remain unavailable',()=>{
 for(const at of ['2026-06-30T20:00:00.001Z','2026-07-01T00:00:00Z'])assert.throws(()=>run(exact(at)));
 for(const field of ['acceptedAt','effectiveAvailableAt']){const p=exact('2026-06-30T20:00:01Z');p[field]='2026-06-30T11:35:25Z';assert.throws(()=>run(p));}
 const p=exact('2026-06-30T11:35:25Z');p.officialSubmissions.entry.acceptanceDateTime=null;assert.throws(()=>run(p));
});
test('original metadata binding cannot be replaced by candidate timestamp or unknown basis',()=>{
 for(const mutate of [p=>delete p.officialSubmissions,p=>p.officialSubmissions.sha256='b'.repeat(64),p=>p.officialSubmissions.rowIndex=-1,p=>p.officialSubmissions.entry.accessionNumber='candidate-pass',p=>p.availabilityBasis='PASS']){const p=exact('2026-06-30T11:35:25Z');mutate(p);assert.throws(()=>run(p));}
});
test('typed fallback applies only without exact acceptance and respects New York next-day DST',()=>{
 for(const [filingDate,effectiveAvailableAt]of [['2026-03-07','2026-03-08T00:00:00-05:00'],['2026-03-08','2026-03-09T00:00:00-04:00']]){
 const p=exact('2026-06-30T11:35:25Z');p.acceptedAt=null;p.officialSubmissions.entry.acceptanceDateTime=null;p.officialSubmissions.entry.filingDate=filingDate;p.availabilityBasis='conservative_next_day_policy';p.conservativeAvailableAt=p.effectiveAvailableAt=effectiveAvailableAt;
 assert.equal(run(p).basis,'conservative_next_day_policy');
 p.effectiveAvailableAt=p.conservativeAvailableAt=filingDate+'T00:00:00-05:00';assert.throws(()=>run(p));
 }
 const p=exact('2026-06-30T11:35:25Z');p.availabilityBasis='conservative_next_day_policy';assert.throws(()=>run(p));
});
test('unreviewed or altered availability policy cannot grant source admission',()=>{
 for(const b of [undefined,Buffer.from('{}'),Buffer.alloc(100001)])assert.throws(()=>verifyReportedAvailabilityReview(b));
});
