import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {memoryDB} from './market-fixture.mjs';

test('retiring one legacy ETF key never recreates it or changes other verified rows in any compatibility format',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}}),f=memoryDB();
 try{
  const {usETFValuationResponse:respond}=await vite.ssrLoadModule('/src/server/us-etf-valuation-response.ts');
  const entries=JSON.parse(await readFile('data/us-etf-verified-publication.json')).entries.filter(e=>['XLK','XLU'].includes(e.code)&&JSON.parse(e.preparedReading).date==='2026-06-30');
  assert.equal(entries.length,2);
  for(const e of entries)f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/'+e.code,JSON.stringify({source:'self_us_etf',history:{'2026-06-30':JSON.parse(e.preparedReading)}}),e.version);
  const original=f.sqlite.prepare('SELECT key,payload,updated_at FROM market_snapshot ORDER BY key').all(),formats=['','event-equity-v2','audited-events-v3','quarterly-history-v4','quarterly-sectors-v5','metric-estimates-v6','sector-methods-v7'];
  const get=async format=>{const response=await respond(new URL('https://test/api/valuations/US?date=2026-11-09'+(format?'&format='+format:'')),f.db,entries,null);assert.equal(response.status,200);return(await response.json()).data.rows;};
  const baselines=await Promise.all(formats.map(get));assert(baselines.every(rows=>rows.some(r=>r.code==='XLK')&&rows.some(r=>r.code==='XLU')));
  for(const mode of ['absent','retired']){
   f.sqlite.prepare('DELETE FROM market_snapshot WHERE key=?').run('valuation/US/XLK');
   if(mode==='retired')f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK',JSON.stringify({source:'retired',code:'XLK',history:{}}),'2026-11-10T00:00:00.000Z');
   for(const [i,format]of formats.entries()){const rows=await get(format);assert.deepEqual(rows,baselines[i].filter(r=>r.code!=='XLK'));}
  }
  f.sqlite.prepare('DELETE FROM market_snapshot WHERE key=?').run('valuation/US/XLK');
  const x=original.find(r=>r.key==='valuation/US/XLK');f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run(x.key,x.payload,x.updated_at);
  assert.deepEqual(f.sqlite.prepare('SELECT key,payload,updated_at FROM market_snapshot ORDER BY key').all(),original);
  for(const [i,format]of formats.entries())assert.deepEqual(await get(format),baselines[i]);
  assert.equal(f.stats.writes,0);
 }finally{f.close();await vite.close();}
});


test('retired XLK cannot be recreated through import/backfill/repair/restore; quarterly scope excludes it',async()=>{
 const {importETFValuations,restoreETFValuations}=await import('../scripts/us-etf-valuation-import.mjs'),{repairETFValuations,restoreETFRepairs}=await import('../scripts/us-etf-valuation-repair.mjs'),{NPORT_SERIES,prepareNPORTCandidates}=await import('../scripts/us-etf-quarterly-job.mjs');
 let reads=0;const db={prepare(){reads++;throw Error('Unexpected access');}},now=Date.parse('2026-11-10T10:00:00Z');
 for(const backfill of[false,true])await assert.rejects(()=>importETFValuations({db,inputs:[{code:'XLK'}],now,backfill,dryRun:false}),/retired/);
 await assert.rejects(()=>repairETFValuations({db,repairs:[{input:{code:'XLK'}}],now,dryRun:false}),/retired/);
 for(const restore of[restoreETFValuations,restoreETFRepairs])await assert.rejects(()=>restore({db,prior:[{key:'valuation/US/XLK'}],now,expectedVersion:'2026-11-09T00:00:00.000Z',dryRun:false}),/retired/);
 assert.equal(reads,0);assert.equal(NPORT_SERIES.XLK,undefined);assert.equal(Object.keys(NPORT_SERIES).length,10);
 let requests=0;const result=await prepareNPORTCandidates({latestDates:Object.fromEntries(Object.keys(NPORT_SERIES).map(code=>[code,'2026-06-30'])),now,read:async()=>{requests++;return Response.json({cik:'1064641',filings:{recent:Object.fromEntries(['accessionNumber','form','reportDate','filingDate','acceptanceDateTime','primaryDocument'].map(k=>[k,[]]))}});}});
 assert.equal(requests,1);assert.equal(result.valuationWrites,0);assert.equal(result.candidates.length,0);
});
