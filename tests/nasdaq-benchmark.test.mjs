import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {preparedDB,fixtureNow} from './market-fixture.mjs';
test('Nasdaq is the default, legacy S&P remains explicit, and a controlled initialization reuses dated market sentiment',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
 const f=await preparedDB(vite);
 try{
  const {BENCHMARKS}=await vite.ssrLoadModule('/src/market-types.ts'),{validSymbol}=await vite.ssrLoadModule('/src/server/market-data.ts'),{attachHTTP}=await vite.ssrLoadModule('/src/server/market-http.ts'),{usReadings}=await vite.ssrLoadModule('/src/lib/us-overview.ts');
  assert.equal(BENCHMARKS.US.symbol,'^IXIC');assert.equal(BENCHMARKS.US.kind,'index');
  for(const s of['^IXIC','^GSPC','NVDA'])assert.equal(validSymbol('US',s),true);assert.equal(validSymbol('US','^UNKNOWN'),false);
  const old=f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key='US/^GSPC'").get().payload;
  const row=f.sqlite.prepare("SELECT * FROM market_snapshot WHERE key='US/^IXIC'").get(),payload=JSON.parse(row.payload);
  f.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run('overview/US',JSON.stringify({source:'cnn_whit3rabbit',calculation:{history:{'2026-10-29':[[20,1,2,.5,20,1],[30,40,50,60,70,80],252],'2026-11-02':[[90,1,2,.5,20,1],[30,40,50,60,70,80],252]}}}),row.updated_at);
  const ready=await attachHTTP(f.db,{key:row.key,payload,processed:0,text:'',bytes:0},fixtureNow);
  assert.deepEqual(Object.keys(ready.payload.view.usOverview.history),['2026-10-29']);
  assert.equal(usReadings(ready.payload.view,'2026-10-29').priceStrength.value,1);
  assert.deepEqual(ready.payload.calculation,payload.calculation);
  assert.equal(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key='US/^GSPC'").get().payload,old);
  assert.equal(f.stats.writes,0);
 }finally{f.close();await vite.close();}
});
