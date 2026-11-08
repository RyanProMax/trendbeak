import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,readFile,rm,stat}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{memoryDB}from'./market-fixture.mjs';import{etfInput,cutoff}from'./us-etf-fixture.mjs';import{importETFValuations}from'../scripts/us-etf-valuation-import.mjs';import{repairETFValuation,repairETFValuations,restoreETFRepairs}from'../scripts/us-etf-valuation-repair.mjs';import{calculateETF}from'../scripts/us-etf-valuations.mjs';
const now=Date.parse(cutoff)+1000;
// Actual DVN weight in the audited 2026-06-30 NPORT input. The other holding is
// synthetic: this tests the 98% admission gate, not a full XLE recomputation.
function xle(){const x=etfInput();x.code='XLE';Object.assign(x.holdings[0],{symbol:'DVN',weight:0.02858964043317});x.holdings[1].weight=1-x.holdings[0].weight;return x;}
function unresolved(){const x=xle(),h=x.holdings[0];Object.assign(h,{shares:null,equity:null,revenue:null,corporateActionsStatus:'unresolved_other'});return x;}
test('known May 7 Devon/Coterra merger cannot use standalone shares or pre-merger financials; missing weight hides both ratios',()=>{
 const old=xle();old.holdings[0].corporateActionsStatus='unresolved_other';assert.throws(()=>calculateETF(old),/Unresolved corporate action/);
 const corrected=calculateETF(unresolved()).reading;for(const m of ['pb','ps']){assert.equal(corrected[m].value,null);assert.ok(Math.abs(corrected[m].verifiedCoverage-(1-0.02858964043317))<1e-12);}
});
test('reviewed same-date repair requires exact old/new hashes and a private backup; other ETF rows remain identical',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-repair-'));try{
  await importETFValuations({db:f.db,inputs:[xle(),etfInput()],now,dryRun:false,backup:dir+'/initial.json'});
  const other=f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/XLK').payload;
  const input=unresolved(),plan=await repairETFValuation({db:f.db,input,now});assert.equal(plan.writes,0);assert.equal(plan.newValues.pb,null);
  await assert.rejects(repairETFValuation({db:f.db,input,now,dryRun:false,backup:dir+'/missing-hashes.json'}),/hashes required/);
  for(const which of ['expectedOldHash','expectedNewHash'])await assert.rejects(repairETFValuation({db:f.db,input,now,expectedOldHash:plan.oldHash,expectedNewHash:plan.newHash,[which]:'0'.repeat(64)}),/hash/);
  const result=await repairETFValuation({db:f.db,input,now:now+1000,expectedOldHash:plan.oldHash,expectedNewHash:plan.newHash,dryRun:false,backup:dir+'/before-repair.json'});assert.equal(result.writes,1);
  const saved=JSON.parse(await readFile(dir+'/before-repair.json','utf8'));assert.equal(saved[0].repair.oldHash,plan.oldHash);assert.equal((await stat(dir+'/before-repair.json')).mode&0o777,0o600);
  assert.equal(f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/XLK').payload,other);
  assert.equal((await repairETFValuation({db:f.db,input,now:now+1000})).oldHash,plan.newHash);
  await assert.rejects(repairETFValuation({db:f.db,input,now:now+1000,expectedOldHash:plan.oldHash,expectedNewHash:plan.newHash}),/changed/);
 }finally{f.close();await rm(dir,{recursive:true});}
});
test('concurrent same-version payload modification is also protected by the exact-payload CAS',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-repair-cas-'));try{
  await importETFValuations({db:f.db,inputs:[xle()],now,dryRun:false,backup:dir+'/initial.json'});
  const input=unresolved(),plan=await repairETFValuation({db:f.db,input,now});
  const db={prepare(sql){const stmt=f.db.prepare(sql);return{bind(...args){const bound=stmt.bind(...args);return{...bound,async run(){f.sqlite.prepare('UPDATE market_snapshot SET payload=? WHERE key=?').run('{"concurrent":true}','valuation/US/XLE');return bound.run();}};}};}};
  await assert.rejects(repairETFValuation({db,input,now,expectedOldHash:plan.oldHash,expectedNewHash:plan.newHash,dryRun:false,backup:dir+'/before-repair.json'}),/not confirmed/);
  assert.equal(f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/XLE').payload,'{"concurrent":true}');
 }finally{f.close();await rm(dir,{recursive:true});}
});

test('reviewed Devon merger equity is a narrow pro forma bridge with actual post-merger shares, never a revenue bridge',()=>{
 const input=xle(),h=input.holdings[0];h.equity.basis='common_pro_forma_event_bridge';h.equity.value=40375000000;h.shares.value=1153403107;h.revenue=null;
 const row=calculateETF(input).reading;assert.equal(row.qualityFlags.eventProForma,1);assert.ok(row.pb.value>0);assert.equal(row.ps.value,null);
 for(const mutate of [x=>x.code='XLK',x=>x.holdings[0].symbol='OTHER',x=>x.holdings[0].shares.basis='event_reconstructed_common_equivalent',x=>x.holdings[0].revenue={...x.holdings[1].revenue,basis:'ttm_carve_out_reported'}]){
  const bad=structuredClone(input);mutate(bad);assert.throws(()=>calculateETF(bad));
 }
});

test('June 2026 Devon checkpoint rejects a stale standalone collector even when its event flag was omitted',()=>{
 const input=xle();Object.assign(input,{date:'2026-06-30',holdingsAsOf:'2026-06-30',cutoff:'2026-06-30T20:00:00Z',availableAt:'2026-08-28T16:27:25Z',pricingBasis:'portfolio_fair_value_per_share'});
 for(const h of input.holdings){h.corporateActionsCheckedThrough=input.date;Object.assign(h.price,{asOf:input.date,availableAt:input.availableAt,basis:input.pricingBasis});for(const f of ['shares','equity','revenue'])Object.assign(h[f],{asOf:'2026-03-31',availableAt:'2026-05-01T16:00:00Z'});}
 assert.throws(()=>calculateETF(input),/post-merger Devon/);
 const h=input.holdings[0];Object.assign(h.shares,{asOf:'2026-05-18',availableAt:'2026-05-28T16:00:00Z',value:1153403107});Object.assign(h.equity,{basis:'common_pro_forma_event_bridge',availableAt:'2026-05-22T16:00:00Z',value:40375000000});h.revenue=null;
 assert.ok(calculateETF(input).reading.pb.value>0);assert.equal(calculateETF(input).reading.ps.value,null);
});

test('two reviewed corrections publish together and a concurrent second key prevents either replacement',async()=>{
 for(const conflict of [false,true]){
  const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-repair-pair-'));try{
   const a=xle(),b={...etfInput(),code:'XLB'};await importETFValuations({db:f.db,inputs:[a,b],now,dryRun:false,backup:dir+'/initial.json'});
   const original=f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all();b.holdings[0].price.value++;
   const inputs=[unresolved(),b],plan=await repairETFValuations({db:f.db,repairs:inputs.map(input=>({input})),now});
   const repairs=inputs.map((input,i)=>({input,expectedOldHash:plan.corrections[i].oldHash,expectedNewHash:plan.corrections[i].newHash}));
   const db=conflict?{prepare(sql){const stmt=f.db.prepare(sql);return{bind(...args){const bound=stmt.bind(...args);return{...bound,async run(){f.sqlite.prepare('UPDATE market_snapshot SET updated_at=? WHERE key=?').run('concurrent','valuation/US/XLB');return bound.run();}};}};}}:f.db;
   const operation=repairETFValuations({db,repairs,now:now+1000,dryRun:false,backup:dir+'/before-pair.json'});
   if(conflict){await assert.rejects(operation,/not confirmed/);assert.deepEqual(f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all(),original);}
   else{assert.equal((await operation).writes,2);for(let i=0;i<inputs.length;i++)assert.equal((await repairETFValuation({db:f.db,input:inputs[i],now:now+1000})).oldHash,repairs[i].expectedNewHash);}
  }finally{f.close();await rm(dir,{recursive:true});}
 }
});

test('June 2026 DuPont admits only the reviewed approximate May 22 base divided by the June 24 reverse split',()=>{
 const x=etfInput();Object.assign(x,{code:'XLB',date:'2026-06-30',holdingsAsOf:'2026-06-30',cutoff:'2026-06-30T20:00:00Z',availableAt:'2026-08-28T16:23:11Z',pricingBasis:'portfolio_fair_value_per_share'});
 for(const h of x.holdings){h.corporateActionsCheckedThrough=x.date;Object.assign(h.price,{asOf:x.date,availableAt:x.availableAt,basis:x.pricingBasis});for(const f of ['shares','equity','revenue'])Object.assign(h[f],{asOf:'2026-03-31',availableAt:'2026-05-01T16:00:00Z'});}
 x.holdings[0].symbol='DD';assert.throws(()=>calculateETF(x),/split-adjusted DuPont/);
 Object.assign(x.holdings[0].shares,{basis:'estimated_split_adjusted_last_known_common_outstanding',asOf:'2026-05-22',availableAt:'2026-06-24T20:39:22Z',value:405058202/3,splitAdjustment:{baseValue:405058202,baseAsOf:'2026-05-22',effectiveDate:'2026-06-24',numerator:1,denominator:3,source:'filing'}});
 const row=calculateETF(x).reading;assert.ok(row.ps.value>0);assert.equal(row.qualityFlags.eventReconstructedShares,1);
 for(const mutate of [y=>y.holdings[0].shares.value=409921306/3,y=>y.holdings[0].shares.value=405058202,y=>y.holdings[0].shares.asOf='2026-05-01',y=>y.holdings[0].shares.availableAt='2026-05-26T20:00:00Z',y=>y.holdings[0].symbol='OTHER',y=>y.code='XLK']){const bad=structuredClone(x);mutate(bad);assert.throws(()=>calculateETF(bad));}
});
test('reviewed repair rollback checks both payload hashes and version, restores every original byte atomically and advances the version',async()=>{
 for(const conflict of[false,true]){const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-repair-restore-'));try{
  const a=xle(),b=etfInput();await importETFValuations({db:f.db,inputs:[a,b],now,dryRun:false,backup:dir+'/seed.json'});const old=f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all();b.holdings[0].price.value++;
  const inputs=[unresolved(),b],plan=await repairETFValuations({db:f.db,repairs:inputs.map(input=>({input})),now}),repairs=inputs.map((input,i)=>({input,expectedOldHash:plan.corrections[i].oldHash,expectedNewHash:plan.corrections[i].newHash}));
  const published=await repairETFValuations({db:f.db,repairs,now:now+1000,dryRun:false,backup:dir+'/before.json'}),prior=JSON.parse(await readFile(dir+'/before.json','utf8')),current=f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all();
  assert.equal((await restoreETFRepairs({db:f.db,prior,expectedVersion:published.publicationVersion,now:now+2000})).writes,0);
  const bad=structuredClone(prior);bad[0].payload+=' ';await assert.rejects(restoreETFRepairs({db:f.db,prior:bad,expectedVersion:published.publicationVersion,now:now+2000}),/backup/);
  const db=conflict?{prepare(sql){const stmt=f.db.prepare(sql);return{bind(...args){const bound=stmt.bind(...args);return{...bound,async run(){f.sqlite.prepare('UPDATE market_snapshot SET payload=? WHERE key=?').run('{}','valuation/US/XLK');return bound.run();}};}};}}:f.db;
  const operation=restoreETFRepairs({db,prior,expectedVersion:published.publicationVersion,now:now+2000,dryRun:false,backup:dir+'/before-rollback.json'});
  if(conflict){await assert.rejects(operation,/not confirmed/);assert.equal(f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/XLE').payload,current.find(r=>r.key.endsWith('/XLE')).payload);}
  else{const restored=await operation;assert.equal(restored.writes,2);assert.notEqual(restored.publicationVersion,published.publicationVersion);assert.deepEqual(f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all(),old);await assert.rejects(restoreETFRepairs({db:f.db,prior,expectedVersion:published.publicationVersion,now:now+3000}),/changed/);}
 }finally{f.close();await rm(dir,{recursive:true});}}
});
