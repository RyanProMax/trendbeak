import assert from 'node:assert/strict'; import test, { before, after } from 'node:test'; import { createServer } from 'vite';
import { memoryDB } from './market-fixture.mjs'; import { etfInput, date } from './us-etf-fixture.mjs'; import { calculateETF, METHOD, MIN_COVERAGE, SECTORS } from '../scripts/us-etf-valuations.mjs';
let vite, respond;
before(async () => { vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }); respond = (await vite.ssrLoadModule('/src/server/us-etf-valuation-response.ts')).usETFValuationResponse; const contract=await vite.ssrLoadModule('/src/lib/us-etf-valuations.ts'); assert.equal(contract.ETF_METHOD_VERSION,METHOD);assert.equal(contract.ETF_MIN_COVERAGE,MIN_COVERAGE);assert.deepEqual(Object.fromEntries(contract.US_SECTOR_ETFS),SECTORS); });
after(async () => vite?.close());
test('ETF reader projects one exact prepared date and exposes quality without the private source inputs', async () => {
  const f = memoryDB(); try {
    const row = calculateETF(etfInput()).reading;
    f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK', JSON.stringify({ source: 'self_us_etf', history: { [date]: row }, latest: { privateRaw: 'not for public response' } }), date);
    const r = await respond(new URL('https://test/api/valuations/US?date=' + date), f.db), text = await r.text();
    assert.equal(r.status, 200); assert.deepEqual(JSON.parse(text).data.rows, [row]); assert.ok(!text.includes('privateRaw'));
    assert.equal(f.stats.reads, 1); assert.equal(f.stats.writes, 0); assert.match(f.stats.sql[0], /LIMIT 11/); assert.ok(!f.stats.sql[0].includes('SELECT payload'));
    assert.deepEqual((await (await respond(new URL('https://test/api/valuations/US?date=2026-11-04'), f.db)).json()).data.rows, []);
  } finally { f.close(); }
});
test('invalid dates never read; future ranks, insufficient quality and nonfinite values fail closed', async () => {
  const f = memoryDB(); try {
    for (const d of ['2026-02-30', 'abc', '2026-11-05%22']) assert.equal((await respond(new URL('https://test/api/valuations/US?date=' + d), f.db)).status, 400);
    assert.equal(f.stats.reads, 0);
    for (const mutate of [r => r.pb.percentile = 50, r => r.pb.verifiedCoverage = .9, r => r.date = '2026-11-04', r => r.pb.value = -1]) {
      const row = calculateETF(etfInput()).reading; mutate(row);
      f.sqlite.prepare('INSERT OR REPLACE INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK', JSON.stringify({ source: 'self_us_etf', history: { [date]: row } }), date);
      assert.equal((await respond(new URL('https://test/api/valuations/US?date=' + date), f.db)).status, 503);
    }
  } finally { f.close(); }
});
test('quarterly snapshots are invisible before disclosure and keep their real dates after release', async () => {
  const f=memoryDB();try {
    const row={...calculateETF(etfInput()).reading,date:'2026-06-30',asOf:'2026-06-30T20:00:00Z',pricingBasis:'portfolio_fair_value_per_share',availableAt:'2026-08-28T21:01:00Z',availableDate:'2026-08-29'};
    f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK',JSON.stringify({source:'self_us_etf',history:{[row.date]:row}}),date);
    for(const d of ['2026-06-30','2026-08-28']) assert.deepEqual((await (await respond(new URL('https://test/api/valuations/US?date='+d),f.db)).json()).data.rows,[]);
    const r=await respond(new URL('https://test/api/valuations/US?date=2026-11-05'),f.db);assert.deepEqual((await r.json()).data.rows,[row]);
  }finally{f.close();}
});

test('current source audit annotation retains its actual review date and rejects inconsistent deltas',async()=>{
 const f=memoryDB();try {
  const x=etfInput();x.sourceComparison={date:x.date,source:'holdings',observedAt:'2026-11-08T10:00:00Z',sourceConflict:true,alternateSourceValues:{pb:10,ps:4},alternateCoverage:{pb:1,ps:1}};
  const row=calculateETF(x).reading;
  const save=r=>f.sqlite.prepare('INSERT OR REPLACE INTO market_snapshot VALUES(?,?,?)').run('valuation/US/XLK',JSON.stringify({source:'self_us_etf',history:{[date]:r}}),date);
  save(row);const body=await(await respond(new URL('https://test/api/valuations/US?date='+date),f.db)).json();assert.deepEqual(body.data.rows[0].sourceComparison,row.sourceComparison);assert.equal(body.data.rows[0].pb.value,12.5);
  for(const mutate of [r=>r.sourceComparison.deltaPercent.pb=0,r=>r.sourceComparison.observedAt='invalid',r=>r.sourceComparison.alternateSourceValues.pb=-1,r=>r.qualityFlags.eventProForma=1]) {
   const broken=structuredClone(row);mutate(broken);save(broken);assert.equal((await respond(new URL('https://test/api/valuations/US?date='+date),f.db)).status,503);
  }
 }finally{f.close();}
});
