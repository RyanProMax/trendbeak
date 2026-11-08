import assert from 'node:assert/strict'; import test, { before, after } from 'node:test'; import { createServer } from 'vite';
import { memoryDB } from './market-fixture.mjs'; import { etfInput as baseETFInput, date, cutoff } from './us-etf-fixture.mjs'; import { calculateETF, METHOD, MIN_COVERAGE, SECTORS } from '../scripts/us-etf-valuations.mjs';
const etfInput=()=>({...baseETFInput(),code:'XLV'});
const pbHeld = row => { const r=structuredClone(row);r.pb.value=null;r.pb.percentile=null;if(r.sourceComparison){r.sourceComparison.alternateSourceValues.pb=null;r.sourceComparison.deltaPercent.pb=null;}return r; };
let vite, respond, valid;
before(async () => { vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }); respond = (await vite.ssrLoadModule('/src/server/us-etf-valuation-response.ts')).usETFValuationResponse; const contract=await vite.ssrLoadModule('/src/lib/us-etf-valuations.ts');valid=contract.validETFValuation; assert.equal(contract.ETF_METHOD_VERSION,METHOD);assert.equal(contract.ETF_MIN_COVERAGE,MIN_COVERAGE);assert.deepEqual(Object.fromEntries(contract.US_SECTOR_ETFS),SECTORS); });
after(async () => vite?.close());
test('ETF reader projects one exact prepared date and exposes quality without the private source inputs', async () => {
  const f = memoryDB(); try {
    const row = calculateETF(etfInput()).reading;
    f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLV', JSON.stringify({ source: 'self_us_etf', history: { [date]: row }, latest: { privateRaw: 'not for public response' } }), date);
    const r = await respond(new URL('https://test/api/valuations/US?date=' + date), f.db), text = await r.text();
    assert.equal(r.status, 200); assert.deepEqual(JSON.parse(text).data.rows, [pbHeld(row)]); assert.ok(!text.includes('privateRaw'));
    assert.equal(f.stats.reads, 1); assert.equal(f.stats.writes, 0); assert.match(f.stats.sql[0], /LIMIT 11/); assert.ok(!f.stats.sql[0].includes('SELECT payload'));
    assert.deepEqual((await (await respond(new URL('https://test/api/valuations/US?date=2026-11-04'), f.db)).json()).data.rows, []);
  } finally { f.close(); }
});
test('invalid dates never read; future ranks, insufficient quality and nonfinite values fail closed', async () => {
  const f = memoryDB(); try {
    for (const d of ['2026-02-30', 'abc', '2026-11-05%22']) assert.equal((await respond(new URL('https://test/api/valuations/US?date=' + d), f.db)).status, 400);
    assert.equal(f.stats.reads, 0);
    for (const mutate of [r => r.ps.percentile = 50, r => r.ps.verifiedCoverage = .9, r => r.date = '2026-11-04', r => r.ps.value = -1]) {
      const row = calculateETF(etfInput()).reading; mutate(row);
      f.sqlite.prepare('INSERT OR REPLACE INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLV', JSON.stringify({ source: 'self_us_etf', history: { [date]: row } }), date);
      assert.equal((await respond(new URL('https://test/api/valuations/US?date=' + date), f.db)).status, 503);
    }
  } finally { f.close(); }
});
test('quarterly snapshots are invisible before disclosure and keep their real dates after release', async () => {
  const f=memoryDB();try {
    const row={...calculateETF(etfInput()).reading,date:'2026-06-30',asOf:'2026-06-30T20:00:00Z',pricingBasis:'portfolio_fair_value_per_share',availableAt:'2026-08-28T21:01:00Z',availableDate:'2026-08-29'};
    f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLV',JSON.stringify({source:'self_us_etf',history:{[row.date]:row}}),date);
    for(const d of ['2026-06-30','2026-08-28']) assert.deepEqual((await (await respond(new URL('https://test/api/valuations/US?date='+d),f.db)).json()).data.rows,[]);
    const r=await respond(new URL('https://test/api/valuations/US?date=2026-11-05'),f.db);assert.deepEqual((await r.json()).data.rows,[pbHeld(row)]);
  }finally{f.close();}
});

test('current source audit annotation retains its actual review date and rejects inconsistent deltas',async()=>{
 const f=memoryDB();try {
  const x=etfInput();x.sourceComparison={date:x.date,source:'holdings',observedAt:'2026-11-08T10:00:00Z',sourceConflict:true,alternateSourceValues:{pb:10,ps:4},alternateCoverage:{pb:1,ps:1}};
  const row=calculateETF(x).reading;
  const save=r=>f.sqlite.prepare('INSERT OR REPLACE INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLV',JSON.stringify({source:'self_us_etf',history:{[date]:r}}),date);
  save(row);const body=await(await respond(new URL('https://test/api/valuations/US?date='+date),f.db)).json();assert.deepEqual(body.data.rows[0].sourceComparison,pbHeld(row).sourceComparison);assert.equal(body.data.rows[0].pb.value,null);
  for(const mutate of [r=>r.sourceComparison.deltaPercent.ps=0,r=>r.sourceComparison.observedAt='invalid',r=>r.sourceComparison.alternateSourceValues.ps=-1,r=>r.qualityFlags.eventProForma=1]) {
   const broken=structuredClone(row);mutate(broken);save(broken);assert.equal((await respond(new URL('https://test/api/valuations/US?date='+date),f.db)).status,503);
  }
 }finally{f.close();}
});

test('XLI permits two reviewed event flags without fabricating a PB for excluded equity',async()=>{
 const f=memoryDB();try {
  const x=etfInput();x.code='XLI';for(const [i,symbol]of ['HONA','FDXF'].entries()){const h=x.holdings[i];h.symbol=symbol;h.equity.basis='common_pro_forma_event_bridge';h.equity.value=-100;h.revenue.basis='ttm_carve_out_reported';}
  const row=calculateETF(x).reading;f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLI',JSON.stringify({source:'self_us_etf',history:{[date]:row}}),date);
  const r=await respond(new URL('https://test/api/valuations/US?date='+date),f.db);assert.equal(r.status,200);assert.deepEqual((await r.json()).data.rows,[pbHeld(row)]);
 }finally{f.close();}
});

test('XLE exposes one narrowly reviewed merger equity flag, while two or unrelated fund flags fail closed',async()=>{
 const f=memoryDB();try{
  const x=etfInput();x.code='XLE';x.holdings[0].symbol='DVN';x.holdings[0].equity.basis='common_pro_forma_event_bridge';x.holdings[0].revenue=null;
  const row=calculateETF(x).reading,save=r=>f.sqlite.prepare('INSERT OR REPLACE INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLE',JSON.stringify({source:'self_us_etf',history:{[date]:r}}),date);
  save(row);const r=await respond(new URL('https://test/api/valuations/US?date='+date+'&format=event-equity-v2'),f.db);assert.equal(r.status,200);assert.equal(valid(row,date),true);const current=(await r.json()).data.rows[0];assert.equal(current.pb.value,null);assert.equal(current.ps.value,null);assert.equal(current.qualityFlags.eventProForma,1);
  const legacy=await(await respond(new URL('https://test/api/valuations/US?date='+date),f.db)).json();assert.equal(legacy.data.rows[0].pb.value,null);assert.equal(legacy.data.rows[0].ps.value,null);assert.equal(legacy.data.rows[0].qualityFlags.eventProForma,0);assert.equal(legacy.data.rows[0].sourceComparison,undefined);
  row.qualityFlags.eventProForma=2;save(row);assert.equal((await respond(new URL('https://test/api/valuations/US?date='+date+'&format=event-equity-v2'),f.db)).status,503);
 }finally{f.close();}
});

test('legacy format withholds DuPont split estimates without invalidating other funds or exposing alternates',async()=>{
 const f=memoryDB();try{
  const x=etfInput();x.code='XLB';x.sourceComparison={date,source:'holdings',observedAt:cutoff,sourceConflict:false,alternateSourceValues:{pb:12,ps:4},alternateCoverage:{pb:1,ps:1}};
  const row=calculateETF(x).reading;row.qualityFlags.eventReconstructedShares=1;
  f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLB',JSON.stringify({source:'self_us_etf',history:{[date]:row}}),date);
  const canonical=await(await respond(new URL('https://test/api/valuations/US?date='+date+'&format=event-equity-v2'),f.db)).json();assert.equal(valid(row,date),true);assert.equal(canonical.data.rows[0].pb.value,null);assert.equal(canonical.data.rows[0].ps.value,null);assert.equal(canonical.data.rows[0].sourceComparison,undefined);
  const legacy=await(await respond(new URL('https://test/api/valuations/US?date='+date),f.db)).json();assert.equal(legacy.data.rows[0].pb.value,null);assert.equal(legacy.data.rows[0].ps.value,null);assert.equal(legacy.data.rows[0].qualityFlags.eventReconstructedShares,0);assert.equal(legacy.data.rows[0].sourceComparison,undefined);
  const reads=f.stats.reads;assert.equal((await respond(new URL('https://test/api/valuations/US?date='+date+'&format=unknown'),f.db)).status,400);assert.equal(f.stats.reads,reads);
 }finally{f.close();}
});

test('corporate-action safety hold suppresses all five funds in both formats, while all PB values and PB comparisons stay hidden, without changing stored inputs or other PS values',async()=>{
 const f=memoryDB();try{
  const expected=[];for(const code of Object.keys(SECTORS)){const x=etfInput();x.code=code;x.sourceComparison={date,source:'holdings',observedAt:cutoff,sourceConflict:true,alternateSourceValues:{pb:12,ps:4},alternateCoverage:{pb:1,ps:1}};const row=calculateETF(x).reading;expected.push(row);f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/'+code,JSON.stringify({source:'self_us_etf',history:{[date]:row}}),date);}
  const before=f.sqlite.prepare('SELECT key,payload,updated_at FROM market_snapshot ORDER BY key').all();
  for(const format of ['', '&format=event-equity-v2', '&format=audited-events-v3']){const response=await respond(new URL('https://test/api/valuations/US?date='+date+format),f.db);assert.equal(response.status,200);const rows=(await response.json()).data.rows;assert.equal(rows.length,11);for(const row of rows){if(['XLE','XLB','XLK','XLY','XLF'].includes(row.code)){assert.equal(row.pb.value,null);assert.equal(row.ps.value,null);assert.equal(row.pb.percentile,null);assert.equal(row.ps.percentile,null);assert.equal(row.sourceComparison,undefined);}else assert.deepEqual(row,pbHeld(expected.find(r=>r.code===row.code)));}}
  assert.equal(f.stats.writes,0);assert.deepEqual(f.sqlite.prepare('SELECT key,payload,updated_at FROM market_snapshot ORDER BY key').all(),before);
 }finally{f.close();}
});

test('only exact verified version and prepared quarter reading release holds; same-date changes and old records stay hidden in all formats',async()=>{
 const f=memoryDB();try{
  const row={...calculateETF({...etfInput(),code:'XLK'}).reading,date:'2026-06-30',asOf:'2026-06-30T20:00:00Z',availableAt:'2026-08-28T15:00:00Z',availableDate:'2026-08-28',pricingBasis:'portfolio_fair_value_per_share'};row.qualityFlags.eventReconstructedShares=1;row.sourceComparison={sourceConflict:true,observedAt:'2026-11-08T10:00:00Z',alternateSourceValues:{pb:row.pb.value,ps:row.ps.value},deltaPercent:{pb:0,ps:0}};
  const version='2026-11-08T12:00:00.000Z',save=(r,v=version)=>f.sqlite.prepare('INSERT OR REPLACE INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK',JSON.stringify({source:'self_us_etf',history:{[r.date]:r}}),v);
  const {publicationEntries}=await vite.ssrLoadModule('/src/server/us-etf-publication.ts'),proof={schema:'verified-etf-publication-v1',auditSha256:'a'.repeat(64),bundleSha256:'b'.repeat(64),verifiedAt:'2026-11-08T12:01:00.000Z',entries:[{code:'XLK',date:row.date,version,payloadSha256:'c'.repeat(64),preparedReading:JSON.stringify(row)}]},entries=publicationEntries(proof);assert.equal(entries.length,1);
  save(row);for(const format of['','&format=event-equity-v2','&format=audited-events-v3']){
   const get=async d=>{const r=await respond(new URL('https://test/api/valuations/US?date='+d+format),f.db,entries);assert.equal(r.status,200);return(await r.json()).data.rows;};
   assert.deepEqual(await get('2026-08-27'),[]);const publicRow=(await get('2026-11-05'))[0];
   if(format.includes('audited-events-v3'))assert.deepEqual(publicRow,row);else{assert.equal(publicRow.pb.value,null);assert.equal(publicRow.ps.value,null);assert.equal(publicRow.sourceComparison,undefined);assert.equal(publicRow.qualityFlags.eventReconstructedShares,0);}
  }
  for(const mutate of [r=>r.pb.value++,r=>r.ps.value++,r=>r.sourceComparison.observedAt='2026-11-08T11:00:00Z',r=>r.qualityFlags.sharesOver90Days++]){
   const changed=structuredClone(row);mutate(changed);save(changed);
   for(const format of['','&format=event-equity-v2','&format=audited-events-v3']){const result=await respond(new URL('https://test/api/valuations/US?date=2026-11-05'+format),f.db,entries);assert.equal(result.status,200);const r=(await result.json()).data.rows[0];assert.equal(r.pb.value,null);assert.equal(r.ps.value,null);assert.equal(r.sourceComparison,undefined);}
  }
  save(row,'2026-11-08T12:00:00.001Z');const body=await(await respond(new URL('https://test/api/valuations/US?date=2026-11-05&format=audited-events-v3'),f.db,entries)).json();assert.equal(body.data.rows[0].pb.value,null);assert.equal(body.data.rows[0].ps.value,null);
  for(const malformed of[{},null,{...proof,entries:[null]},{...proof,entries:[{...proof.entries[0],extra:'x'.repeat(250001)}]},{...proof,auditSha256:'wrong'},{...proof,entries:[...proof.entries,...proof.entries]},{...proof,entries:[{...proof.entries[0],preparedReading:'invalid'}]}])assert.deepEqual(publicationEntries(malformed),[]);
  assert.equal(f.stats.writes,0);
 }finally{f.close();}
});

test('quarterly v4 binds ranks and every historical reading; older clients never receive ranks or pre-feature history',async()=>{
 const f=memoryDB();try{
  const row={...calculateETF({...etfInput(),code:'XLU'}).reading,date:'2026-06-30',asOf:'2026-06-30T20:00:00Z',availableAt:'2026-08-28T15:00:00Z',availableDate:'2026-08-28',pricingBasis:'portfolio_fair_value_per_share'};
  row.ps.percentile=79.16666666666666;row.ps.quarterlyHistory={frequency:'quarterly',scope:'reported_recast_and_reviewed_scope_estimates',currentExcluded:true,method:'midrank-prior-quarter-observations-v1',sourceSeriesId:'sec_nport_quarterly',maximumWindowYears:10,evaluatedAt:row.asOf,sampleCount:24,windowStart:'2019-09-30',windowEnd:'2026-03-31',spanQuarters:26,minimumSamples:20,minimumSpanQuarters:20,status:'available',missingQuarterCount:3,withoutOfficialProForma:{sampleCount:21,percentile:85.71428571428571}};
  assert.equal(valid(row,'2026-11-05'),true);
  for(const change of [{sampleCount:19},{windowEnd:row.date},{minimumSamples:19},{spanQuarters:19},{sampleCount:41},{currentExcluded:false},{withoutOfficialProForma:{sampleCount:25,percentile:88}}])assert.equal(valid({...row,ps:{...row.ps,quarterlyHistory:{...row.ps.quarterlyHistory,...change}}},'2026-11-05'),false);
  const old=structuredClone(row);Object.assign(old,{date:'2026-03-31',asOf:'2026-03-31T20:00:00Z',availableAt:'2026-05-28T15:00:00Z',availableDate:'2026-05-28'});old.ps.percentile=null;delete old.ps.quarterlyHistory;
  const version='2026-11-08T12:00:00.000Z';f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLU',JSON.stringify({source:'self_us_etf',history:{[old.date]:old,[row.date]:row}}),version);
  const approved=[old,row].map(r=>({code:r.code,date:r.date,version,payloadSha256:'a'.repeat(64),preparedReading:JSON.stringify(r)}));
  const bounded={prepare(sql){assert.match(sql,/releases\(key,version,reading\) AS MATERIALIZED/);return{bind(...values){assert.ok(values.length<=100);assert.equal(values.length,15);return f.db.prepare(sql).bind(...values);}};}};
  const get=async(date,format,proof=approved)=>{const result=await respond(new URL('https://test/api/valuations/US?date='+date+'&format='+format),bounded,proof);assert.equal(result.status,200);return(await result.json()).data.rows;};
  assert.deepEqual(await get('2026-05-28','quarterly-history-v4'),[old]);assert.deepEqual(await get('2026-05-28','audited-events-v3'),[]);assert.deepEqual(await get('2026-05-27','quarterly-history-v4'),[]);
  assert.deepEqual(await get('2026-11-05','quarterly-history-v4'),[row]);const scaled=[...approved,...Array.from({length:36},(_,i)=>({...approved[0],code:'fixture-'+i}))];assert.equal(scaled.length,38);assert.deepEqual(await get('2026-11-05','quarterly-history-v4',scaled),[row]);const legacy=(await get('2026-11-05','audited-events-v3'))[0];assert.equal(legacy.ps.value,row.ps.value);assert.equal(legacy.ps.percentile,null);assert.equal(legacy.ps.quarterlyHistory,undefined);
  const unproved=(await get('2026-05-28','quarterly-history-v4',approved.slice(1)))[0];assert.equal(unproved.ps.value,null);assert.equal(unproved.pb.value,null);
  f.sqlite.prepare('UPDATE market_snapshot SET updated_at=?').run('2026-11-08T12:00:00.001Z');const changed=(await get('2026-11-05','quarterly-history-v4'))[0];assert.equal(changed.ps.value,null);assert.equal(changed.ps.percentile,null);assert.equal(changed.ps.quarterlyHistory,undefined);
 }finally{f.close();}
});
