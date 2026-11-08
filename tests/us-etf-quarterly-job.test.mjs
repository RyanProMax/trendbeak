import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{gzipSync}from'node:zlib';import{createHash}from'node:crypto';
import {NPORT_SERIES,NPORT_INDEX,nportIndexRows,parseNPORTIdentity,prepareNPORTCandidates,readApprovedQuarterlyInputs,appendApprovedQuarterlyInputs} from '../scripts/us-etf-quarterly-job.mjs';
const now=Date.parse('2026-11-08T12:00:00Z'),latestDates=Object.fromEntries(Object.keys(NPORT_SERIES).map(c=>[c,'2026-06-30']));
const index=()=>({cik:'1064641',filings:{recent:{accessionNumber:['0001410368-26-123456'],form:['NPORT-P'],reportDate:['2026-09-30'],filingDate:['2026-11-06'],acceptanceDateTime:['2026-11-06T16:00:00Z'],primaryDocument:['xslFormNPORT-P_X01/primary_doc.xml']}}});
const xml=(series='S000006415',date='2026-09-30')=>`<edgarSubmission xmlns="http://www.sec.gov/edgar/nport"><formData><genInfo><seriesId>${series}</seriesId><repPdDate>${date}</repPdDate></genInfo></formData></edgarSubmission>`;
test('candidate discovery matches original XML series, real report date and disclosure, never accession order',async()=>{
 const saved={},urls=[],pauses=[];const r=await prepareNPORTCandidates({latestDates,now,pause:async ms=>pauses.push(ms),save:async(name,raw)=>saved[name]=raw,read:async url=>{urls.push(url);return new Response(url===NPORT_INDEX?JSON.stringify(index()):xml());}});
 assert.deepEqual(pauses,[1000]);assert.equal(r.candidates[0].code,'XLK');assert.equal(r.candidates[0].availableAt,'2026-11-06T16:00:00Z');assert.match(r.candidates[0].status,/requires/);assert.equal(r.valuationWrites,0);assert.equal(r.sourceCalls,2);assert.match(urls[1],/\/000141036826123456\/primary_doc.xml$/);assert.ok(saved['0001410368-26-123456.xml']);assert.ok(saved['candidates.json']);
});
test('unknown Premium Income series cannot replace ordinary ETF and a current period never becomes an automatic repair',async()=>{
 const read=async url=>new Response(url===NPORT_INDEX?JSON.stringify(index()):xml('S000999999'));
 const r=await prepareNPORTCandidates({latestDates,now,read,pause:async()=>{}});assert.equal(r.candidates.length,0);assert.equal(r.ignored[0].reason,'not_target_series');
 const old=index();old.filings.recent.reportDate[0]='2026-06-30';let calls=0;const done=await prepareNPORTCandidates({latestDates,now,pause:async()=>{},read:async()=>{calls++;return Response.json(old);}});assert.equal(calls,1);assert.equal(done.candidates.length,0);
});
test('source rejection, oversized response, malformed XML, future disclosure and date mismatch fail closed without retries',async()=>{
 let calls=0;await assert.rejects(prepareNPORTCandidates({latestDates,now,read:async()=>{calls++;return new Response('',{status:403});}}),/403.*no retry/);assert.equal(calls,1);
 await assert.rejects(prepareNPORTCandidates({latestDates,now,read:async()=>new Response('x'.repeat(2_000_001))}),/byte limit/);
 assert.throws(()=>parseNPORTIdentity('<!DOCTYPE x><x/>'),/XML/);assert.throws(()=>parseNPORTIdentity(xml().replace('</seriesId>','</seriesId><seriesId>S000006416</seriesId>')),/XML/);
 const future=index();future.filings.recent.acceptanceDateTime[0]='2026-11-09T00:00:00Z';assert.throws(()=>nportIndexRows(future,now),/timestamp/);
 await assert.rejects(prepareNPORTCandidates({latestDates,now,pause:async()=>{},read:async u=>new Response(u===NPORT_INDEX?JSON.stringify(index()):xml('S000006415','2026-06-30'))}),/period differs/);
 const gap={...latestDates,XLK:'2025-12-31'};await assert.rejects(prepareNPORTCandidates({latestDates:gap,now,read:async()=>Response.json(index())}),/recovery/);
});
test('audited local releases require exact gzip/raw hashes and byte limits, equity and event review; never trust source approval claims',async()=>{
 const root=await mkdtemp(join(tmpdir(),'etf-approved-'));try{
  await mkdir(join(root,'data/us-etf-reviewed'),{recursive:true});const raw=Buffer.from(JSON.stringify([{code:'XLK',date:'2026-09-30',pricingBasis:'portfolio_fair_value_per_share'}])),zipped=gzipSync(raw),hash=x=>createHash('sha256').update(x).digest('hex'),file='data/us-etf-reviewed/2026-q3.json.gz';await writeFile(join(root,file),zipped);
  const entry={status:'approved',corporateActionsReviewed:true,commonEquityReviewed:true,file,sha256:hash(zipped),expandedSha256:hash(raw),auditSha256:'a'.repeat(64),expandedBytes:raw.length,date:'2026-09-30'};
  assert.equal((await readApprovedQuarterlyInputs(root,[entry])).length,1);
  for(const change of [{status:'candidate'},{corporateActionsReviewed:false},{commonEquityReviewed:false},{sha256:'b'.repeat(64)},{expandedSha256:'b'.repeat(64)},{expandedBytes:2},{date:'2026-06-30'},{file:'../outside.json.gz'}])await assert.rejects(readApprovedQuarterlyInputs(root,[{...entry,...change}]));
 }finally{await rm(root,{recursive:true});}
});
test('scheduled approved append never revises same-date data, even when supplied replacement values',async()=>{
 let touched=false;const db={prepare(){touched=true;throw Error('Unexpected database access');}};
 const r=await appendApprovedQuarterlyInputs({db,inputs:[{code:'XLK',date:'2026-06-30',holdings:'replacement'}],latestDates,now,dryRun:false});assert.equal(r.writes,0);assert.equal(r.skipped,'no_new_audited_quarter');assert.equal(touched,false);
 await assert.rejects(appendApprovedQuarterlyInputs({db,inputs:[{code:'XLK',date:'2026-09-30'},{code:'XLK',date:'2026-12-31'}],latestDates,now}),/backfill/);assert.equal(touched,false);
});

test('late or earlier-day SEC acceptance is not claimed as immediate public availability',()=>{
 const x=index(),r=x.filings.recent;r.reportDate[0]='2020-03-31';r.acceptanceDateTime[0]='2020-05-29T21:36:00Z';r.filingDate[0]='2020-06-01';const row=nportIndexRows(x,now)[0];assert.equal(row.acceptedAt,r.acceptanceDateTime[0]);assert.equal(row.availableAt,'2020-06-02T04:00:00.000Z');assert.equal(nportIndexRows(x,Date.parse('2020-06-01T20:00:00Z')).length,0);
});
