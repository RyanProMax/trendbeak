import { createHash } from 'node:crypto';
import test from 'node:test'; import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
import { provenanceText } from '../scripts/us-etf-provenance.mjs';
import { memoryDB } from './market-fixture.mjs'; import { etfInput, cutoff } from './us-etf-fixture.mjs'; import { importETFValuations, restoreETFValuations } from '../scripts/us-etf-valuation-import.mjs';
const sha = text => createHash('sha256').update(text).digest('hex');
const backupRow = (row,payload) => ({...row,payload,publication:{oldHash:sha(payload),newHash:sha(row.payload)}});
const now = Date.parse(cutoff) + 1000;
test('dry run is read-only; atomic publication backs up; unchanged rerun does not write; gaps stay absent', async () => {
  const f = memoryDB(), dir = await mkdtemp(join(tmpdir(), 'etf-import-'));
  try {
    const inputs = [etfInput(), { ...etfInput(), code: 'XLF' }], options = { db: f.db, inputs, now };
    assert.equal((await importETFValuations(options)).writes, 0); assert.equal(f.stats.writes, 0);
    assert.equal((await importETFValuations({ ...options, dryRun: false, backup: dir + '/backup.json' })).writes, 2);
    assert.equal(f.stats.writes, 1); assert.equal(JSON.parse(await readFile(dir + '/backup.json', 'utf8')).length, 2);
    assert.equal((await importETFValuations({ ...options, dryRun: false })).writes, 0);
    const stored = JSON.parse(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key=?").get("valuation/US/XLK").payload);
    assert.deepEqual(Object.keys(stored.history), ['2026-11-05']); assert.equal(stored.latest.input.holdings.length, 2); assert.equal(stored.provenance['2026-11-05'][0].url,inputs[0].sources[0].url);
    inputs[0].holdings[0].price.value++;
    await assert.rejects(importETFValuations({ ...options, dryRun: false, backup: dir + '/other.json' }), /differs/);
    assert.equal(f.stats.writes, 1);
  } finally { f.close(); await rm(dir, { recursive: true }); }
});
test('concurrent insert blocks the entire batch without partial writes', async () => {
  const f = memoryDB(), dir = await mkdtemp(join(tmpdir(), 'etf-cas-'));
  try {
    const db = { prepare(sql) { const statement = f.db.prepare(sql); return { bind(...values) { const bound = statement.bind(...values); return { ...bound, async run() { f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK', '{}', 'concurrent'); return bound.run(); } }; } }; } };
    await assert.rejects(importETFValuations({ db, inputs: [etfInput(), { ...etfInput(), code: 'XLF' }], now, dryRun: false, backup: dir + '/backup.json' }), /not confirmed/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM market_snapshot').get().n, 1);
    assert.equal(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key=?").get("valuation/US/XLK").payload, '{}');
  } finally { f.close(); await rm(dir, { recursive: true }); }
});

test('explicit history backfill merges unordered quarters without moving latest, with one read and one atomic write per ETF', async () => {
  const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-backfill-'));
  const at=(date,availableAt)=>{
    const x=etfInput(),cutoff=date+'T20:00:00Z';
    Object.assign(x,{date,cutoff,holdingsAsOf:date,availableAt,pricingBasis:'portfolio_fair_value_per_share'});
    for(const h of x.holdings){h.corporateActionsCheckedThrough=date;Object.assign(h.price,{asOf:date,availableAt,basis:x.pricingBasis});for(const field of ['shares','equity','revenue'])Object.assign(h[field],{asOf:date,availableAt:cutoff});}
    return x;
  };
  const latest=at('2026-09-30','2026-11-05T20:00:00Z'), first=at('2026-03-31','2026-05-28T20:00:00Z'),middle=at('2026-06-30','2026-08-28T20:00:00Z');
  const load=()=>JSON.parse(f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/XLK').payload);
  try{
    await importETFValuations({db:f.db,inputs:[latest],now,dryRun:false,backup:dir+'/initial.json'});
    const priorLatest=load().latest,reads=f.stats.reads;
    await assert.rejects(importETFValuations({db:f.db,inputs:[first],now}),/Older inputs/);
    const report=await importETFValuations({db:f.db,inputs:[middle,first],now,backfill:true,dryRun:false,backup:dir+'/history.json'});
    assert.equal(report.writes,1);assert.equal(f.stats.reads,reads+2);
    assert.deepEqual(Object.keys(load().history),[first.date,middle.date,latest.date]);assert.deepEqual(load().latest,priorLatest);assert.deepEqual(JSON.parse(provenanceText(load().provenance[first.date])),first.sources);
    assert.equal((await importETFValuations({db:f.db,inputs:[first,middle],now,backfill:true,dryRun:false})).writes,0);
    assert.deepEqual(JSON.parse(await readFile(dir+'/history.json','utf8'))[0].payload,JSON.stringify({...load(),history:{[latest.date]:load().history[latest.date]},provenance:{[latest.date]:latest.sources}}));
    const changed=structuredClone(first);changed.holdings[0].price.value++;
    const writes=f.stats.writes;
    await assert.rejects(importETFValuations({db:f.db,inputs:[changed],now,backfill:true}),/differs/);
    const changedSource=structuredClone(first);changedSource.sources[0].url='https://example.invalid/changed';
    await assert.rejects(importETFValuations({db:f.db,inputs:[changedSource],now,backfill:true}),/differs/);
    assert.equal(f.stats.writes,writes);
  }finally{f.close();await rm(dir,{recursive:true});}
});

test('historical admission rejects duplicate identities and oversized batches before database access',async()=>{
 const f=memoryDB();try{
  for(const inputs of [[etfInput(),etfInput()],Array.from({length:45},()=>etfInput())])await assert.rejects(importETFValuations({db:f.db,inputs,now,backfill:true}),/Duplicate|44/);
  assert.equal(f.stats.reads,0);assert.equal(f.stats.writes,0);
 }finally{f.close();}
});

test('backfill backups can be restored atomically only at their exact publication version',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-restore-'));
 try{
  const inputs=[etfInput(),{...etfInput(),code:'XLF'}];
  await importETFValuations({db:f.db,inputs,now,dryRun:false,backup:dir+'/initial.json'});
  const original=f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all();
  const priorInputs=inputs.map(x=>{const p=structuredClone(x);p.date=p.holdingsAsOf='2026-11-04';p.cutoff=p.date+'T21:00:00Z';for(const h of p.holdings){h.price.asOf=p.date;h.price.availableAt=p.cutoff;h.corporateActionsCheckedThrough=p.date;}return p;});
  const published=await importETFValuations({db:f.db,inputs:priorInputs,now:now+1000,backfill:true,dryRun:false,backup:dir+'/before-backfill.json'});
  const prior=JSON.parse(await readFile(dir+'/before-backfill.json','utf8')),opts={db:f.db,prior,expectedVersion:published.publicationVersion,now:now+2000};
  const writes=f.stats.writes;assert.equal((await restoreETFValuations(opts)).writes,0);assert.equal(f.stats.writes,writes);
  const restored=await restoreETFValuations({...opts,dryRun:false,backup:dir+'/before-restore.json'});
  assert.equal(restored.writes,2);assert.notEqual(restored.publicationVersion,published.publicationVersion);
  assert.deepEqual(f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all(),original);
  await assert.rejects(restoreETFValuations(opts),/version changed/);
  await assert.rejects(restoreETFValuations({...opts,prior:JSON.parse(await readFile(dir+'/initial.json','utf8'))}),/existing ETF/);
 }finally{f.close();await rm(dir,{recursive:true});}
});

test('a concurrent update during restore leaves all other published checkpoints intact',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-restore-cas-'));
 try{
  const inputs=[etfInput(),{...etfInput(),code:'XLF'}];
  const initial=await importETFValuations({db:f.db,inputs,now,dryRun:false,backup:dir+'/initial.json'});
  const saved=f.sqlite.prepare('SELECT key,payload,updated_at FROM market_snapshot ORDER BY key').all();
  const prior=saved.map(r=>backupRow(r,JSON.stringify({...JSON.parse(r.payload),reviewNote:'synthetic prior checkpoint'})));
  const db={prepare(sql){const statement=f.db.prepare(sql);return{bind(...values){const bound=statement.bind(...values);return{...bound,async run(){f.sqlite.prepare('UPDATE market_snapshot SET updated_at=? WHERE key=?').run('concurrent','valuation/US/XLF');return bound.run();}};}};}};
  await assert.rejects(restoreETFValuations({db,prior,expectedVersion:initial.publicationVersion,now:now+1000,dryRun:false,backup:dir+'/before-restore.json'}),/not confirmed/);
  assert.deepEqual(f.sqlite.prepare('SELECT key,payload FROM market_snapshot ORDER BY key').all().map(r=>({...r})),saved.map(({key,payload})=>({key,payload})));
 }finally{f.close();await rm(dir,{recursive:true});}
});

test('same-version concurrent payload change prevents the entire append or restore batch',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-payload-cas-'));try{
  const inputs=[etfInput(),{...etfInput(),code:'XLF'}],seed=await importETFValuations({db:f.db,inputs,now,dryRun:false,backup:dir+'/seed.json'});
  const rows=f.sqlite.prepare('SELECT key,payload,updated_at FROM market_snapshot ORDER BY key').all();const before=rows.map(r=>backupRow(r,JSON.stringify({...JSON.parse(r.payload),testPrior:true})));
  const db={prepare(sql){const stmt=f.db.prepare(sql);return{bind(...params){const bound=stmt.bind(...params);return{...bound,async run(){f.sqlite.prepare('UPDATE market_snapshot SET payload=? WHERE key=?').run('{}','valuation/US/XLF');return bound.run();}};}};}};
  await assert.rejects(restoreETFValuations({db,prior:before,expectedVersion:seed.publicationVersion,now:now+1000,dryRun:false,backup:dir+'/restore.json'}),/not confirmed/);
  assert.equal(f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/XLK').payload,rows.find(r=>r.key.endsWith('/XLK')).payload);
 }finally{f.close();await rm(dir,{recursive:true});}
});
test('ordinary appends validate retained compressed source SHA and declared expansion size',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-source-integrity-'));try{
  const input=etfInput();await importETFValuations({db:f.db,inputs:[input],now,backfill:true,dryRun:false,backup:dir+'/seed.json'});
  const row=f.sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/US/XLK'),state=JSON.parse(row.payload);state.provenance[input.date].sha256='0'.repeat(64);f.sqlite.prepare('UPDATE market_snapshot SET payload=? WHERE key=?').run(JSON.stringify(state),'valuation/US/XLK');
  const writes=f.stats.writes;await assert.rejects(importETFValuations({db:f.db,inputs:[input],now}),/integrity/);assert.equal(f.stats.writes,writes);
 }finally{f.close();await rm(dir,{recursive:true});}
});

test('same-version mutation before rollback first read and altered backup bytes both fail closed',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-hash-restore-'));try{
  const seed=await importETFValuations({db:f.db,inputs:[etfInput()],now,dryRun:false,backup:dir+'/seed.json'});
  const row=f.sqlite.prepare('SELECT key,payload,updated_at FROM market_snapshot').get(),prior=[backupRow(row,JSON.stringify({...JSON.parse(row.payload),testPrior:true}))],opts={db:f.db,prior,expectedVersion:seed.publicationVersion,now:now+1000};
  const bad=structuredClone(prior);bad[0].payload+=' ';await assert.rejects(restoreETFValuations({...opts,prior:bad}),/backup hash/);
  f.sqlite.prepare('UPDATE market_snapshot SET payload=?').run(row.payload+' ');const writes=f.stats.writes;await assert.rejects(restoreETFValuations(opts),/payload changed/);assert.equal(f.stats.writes,writes);
 }finally{f.close();await rm(dir,{recursive:true});}
});
test('equal aggregate and source references cannot revise latest consumed input through append or backfill',async()=>{
 const f=memoryDB(),dir=await mkdtemp(join(tmpdir(),'etf-latest-evidence-'));try{
  const input=etfInput();await importETFValuations({db:f.db,inputs:[input],now,dryRun:false,backup:dir+'/seed.json'});
  const before=f.sqlite.prepare('SELECT payload FROM market_snapshot').get().payload,changed=structuredClone(input);changed.holdings[0].price.value*=2;changed.holdings[0].shares.value/=2;
  for(const backfill of[false,true])await assert.rejects(importETFValuations({db:f.db,inputs:[changed],now,backfill}),/consumed input or quality differs/);
  assert.equal(f.sqlite.prepare('SELECT payload FROM market_snapshot').get().payload,before);
 }finally{f.close();await rm(dir,{recursive:true});}
});
