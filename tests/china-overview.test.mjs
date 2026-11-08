import assert from'node:assert/strict';import test,{before,after}from'node:test';import{createServer}from'vite';import{preparedDB,fixtureNow}from'./market-fixture.mjs';
let vite,writer,model,record,http;
before(async()=>{vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}});[writer,model,record,http]=await Promise.all([vite.ssrLoadModule('/src/server/china-overview.ts'),vite.ssrLoadModule('/src/lib/china-overview.ts'),vite.ssrLoadModule('/src/lib/snapshot-record.ts'),vite.ssrLoadModule('/src/server/market-http.ts')]);});after(async()=>vite?.close());
const sources={fearGreed:'baifenwei',rsi:'self_csi300_rsi14_tencent'},today='2026-10-30',rows=Array.from({length:400},(_,i)=>({date:new Date(Date.parse(today)-(399-i)*86400000).toISOString().slice(0,10),values:{fearGreed:20+i%70,rsi:10+i%85}}));
test('independent midrank excludes current/future values, appends incrementally, and revises only its suffix',()=>{
 const first=writer.updateChinaOverview(rows.slice(0,-1),sources,today),appended=writer.updateChinaOverview(rows.slice(-1),sources,today,first.checkpoint),full=writer.updateChinaOverview(rows,sources,today);assert.equal(appended.processed,1);assert.deepEqual(appended.view,full.view);assert.equal(writer.updateChinaOverview(rows.slice(-1),sources,today,appended.checkpoint).processed,0);
 const changed=structuredClone(rows.at(-4));changed.values.rsi=99;const revised=writer.updateChinaOverview([changed],sources,today,full.checkpoint),baseline=writer.updateChinaOverview(rows.map(r=>r.date===changed.date?changed:r),sources,today);assert.equal(revised.processed,4);assert.deepEqual(revised.view,baseline.view);assert.deepEqual(revised.view.history[rows.at(-5).date],full.view.history[rows.at(-5).date]);
 const seed=writer.updateChinaOverview(rows.slice(0,61),sources,today);const sample=rows.slice(0,60).map(r=>r.values.fearGreed),value=rows[60].values.fearGreed,expected=(sample.filter(v=>v<value).length+sample.filter(v=>v===value).length/2)/60*100;assert.equal(seed.view.history[rows[60].date].fearGreed[1],Math.round(expected*10000)/10000);assert.equal(seed.view.history[rows[59].date].fearGreed[1],null);
});
test('supported source identities are fixed and Futu is not admitted through a payload',()=>{
 const valid=writer.updateChinaOverview(rows,sources,today).view;writer.assertPublishableOverview(valid,today);const wrong=structuredClone(valid);wrong.sourceIds.rsi='futu_opend';assert.throws(()=>writer.assertPublishableOverview(wrong,today),/not approved/);
 const valuation={...valid,valuations:{sourceId:'futu_opend',period:'近3个月',rows:[{name:'测试指数',code:'TEST',date:today,pb:{value:1.2,percentile:20},ps:{value:1.3,percentile:30}}]}};assert.ok(model.validChinaOverview(valuation,today));assert.throws(()=>writer.assertPublishableOverview(valuation,today),/Unsupported PB\/PS source/);
 const efunds={...valuation,valuations:{...valuation.valuations,sourceId:'efunds_index'}};assert.ok(model.validChinaOverview(efunds,today));writer.assertPublishableOverview(efunds,today);
 assert.throws(()=>writer.updateChinaOverview(rows.slice(-1),{rsi:'eastmoney_index'},today,writer.updateChinaOverview(rows,sources,today).checkpoint),/merge factor sources/);
});
test('exact-date lookup never substitutes a latest rank or relabels missing values; no CN data is attached to US',async()=>{
 const f=await preparedDB(vite,fixtureNow);try{const old=JSON.parse(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key='CN/000300.SS'").get().payload),date=old.view.asOf,raw=model.chinaReadings(old.view,date);assert.equal(raw.rsi.value,old.view.history[date].values.rsi);assert.equal(raw.rsi.percentile,null);assert.equal(raw.breadth.value,null);
 const initialized=await writer.prepareChinaBenchmark(f.db,old,[],true);const readings=model.chinaReadings(initialized.payload.view,date);assert.ok(readings.rsi.percentile!==null);assert.equal(model.hasCompleteChinaOverview(initialized.payload.view),false);assert.equal(model.hasCompleteChinaOverview(undefined),false);const complete=structuredClone(initialized.payload.view);for(const id of model.CHINA_FACTORS)complete.chinaOverview.history[date][id]=[1,25,60];assert.equal(model.hasCompleteChinaOverview(complete),true);complete.instrument.market='US';assert.equal(model.hasCompleteChinaOverview(complete),false);const noDate=model.chinaReadings(initialized.payload.view,'2026-11-02');assert.equal(noDate.rsi.percentile,null);assert.equal(noDate.rsi.value,null);for(const id of['breadth','limitRatio','turnover','relativeTurnover'])assert.equal(readings[id].value,null);
 const bad={...initialized.payload.view.chinaOverview,history:{[date]:{fearGreed:[null,50,60]}}};assert.equal(model.validChinaOverview(bad,today),false);
 const us=JSON.parse(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key='US/^GSPC'").get().payload).view;assert.equal(record.validSnapshot({...us,chinaOverview:initialized.payload.view.chinaOverview},'US','^GSPC',fixtureNow),false);
 }finally{f.close();}
});
test('controlled initialization and unchanged/append/correction writers preserve the prepared transport and bounded work',async()=>{
 const f=await preparedDB(vite,fixtureNow);try{const row=f.sqlite.prepare("SELECT * FROM market_snapshot WHERE key='CN/000300.SS'").get(),old=JSON.parse(row.payload),initialized=await writer.prepareChinaBenchmark(f.db,old,[],true);assert.equal(initialized.processed,old.calculation.bars.length);const p=await http.attachHTTP(f.db,{key:row.key,payload:initialized.payload,text:'',bytes:0,processed:0},fixtureNow);assert.equal(p.overviewProcessed,0);assert.ok(Buffer.byteLength(p.payload.http.body)<300000);assert.ok(JSON.parse(p.payload.http.body).data.chinaOverview);const repeated=await http.attachHTTP(f.db,p,fixtureNow);assert.equal(repeated.text,p.text);
 const date=old.view.asOf;f.sqlite.prepare("UPDATE sentiment_daily SET score=41 WHERE market='CN' AND date=?").run(date);const changed=await http.attachHTTP(f.db,p,fixtureNow);assert.equal(changed.overviewProcessed,1);assert.equal(JSON.parse(changed.payload.http.body).data.chinaOverview.history[date].fearGreed[0],41);
 const early=old.calculation.bars.at(-60).date;f.sqlite.prepare("UPDATE sentiment_daily SET score=42 WHERE market='CN' AND date=?").run(early);await assert.rejects(http.attachHTTP(f.db,changed,fixtureNow),/Older sentiment correction/);
 }finally{f.close();}
});

test('reviewed import preserves current primary scores and dates, and survives the next daily preparation',async()=>{
 const f=await preparedDB(vite,fixtureNow);try{
  const old=JSON.parse(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key='CN/000300.SS'").get().payload),date=old.view.asOf;
  const initialized=(await writer.prepareChinaBenchmark(f.db,old,[],true)).payload;
  const input={sourceIds:{breadth:'self_legu_activity',limitRatio:'self_legu_activity'},history:{[date]:{breadth:[38.77,null,0],limitRatio:[2.36,null,0]}},valuations:{sourceId:'efunds_index',period:'2020年7月23日至2026年10月30日 · 独立分位',rows:[{name:'科创50',code:'000688',date,pb:{value:5.7,percentile:56.2},ps:{value:7.3,percentile:63.6}}]}};
  const combined=writer.mergeReviewedOverview(initialized,input);
  assert.deepEqual(combined.view.chinaOverview.history[date].fearGreed,initialized.view.chinaOverview.history[date].fearGreed);
  assert.deepEqual(combined.calculation,old.calculation);assert.equal(combined.view.fetchedAt,old.view.fetchedAt);
  assert.deepEqual(writer.mergeReviewedOverview(combined,input),combined);
  const prepared=await http.attachHTTP(f.db,{key:'CN/000300.SS',payload:combined,text:'',bytes:0,processed:0},fixtureNow);
  assert.deepEqual(prepared.payload.view.chinaOverview.history[date].breadth,[38.77,null,0]);
  assert.equal(prepared.payload.view.chinaOverview.valuations.rows.length,1);assert.ok(Buffer.byteLength(prepared.payload.http.body)<300000);
  assert.throws(()=>writer.mergeReviewedOverview(initialized,{...input,sourceIds:{fearGreed:'baifenwei'},history:{[date]:{fearGreed:[99,null,0]}}}),/cannot replace primary/);
  const next=model.chinaReadings(combined.view,'2026-11-02');assert.equal(next.breadth.value,null);assert.equal(next.limitRatio.value,null);
 }finally{f.close();}
});
test('six-axis benchmark transport omits retired optional radar, preserving the complete checkpoint and old snapshot acceptance',async()=>{const f=await preparedDB(vite,fixtureNow,{nvda:true});try{for(const key of['CN/000300.SS','US/^GSPC']){const row=f.sqlite.prepare('SELECT * FROM market_snapshot WHERE key=?').get(key),old=JSON.parse(row.payload);let payload=old;if(key.startsWith('CN'))payload=(await writer.prepareChinaBenchmark(f.db,old,[],true)).payload;else payload={...old,view:{...old.view,usOverview:{sourceId:'cnn_whit3rabbit',history:{}}}};const result=await http.attachHTTP(f.db,{key,payload,text:'',bytes:0,processed:0},fixtureNow),data=JSON.parse(result.payload.http.overview).data;assert.ok(JSON.parse(result.payload.http.body).data.history[data.asOf].radar);assert.equal(data.history[data.asOf].radar,undefined);assert.ok(result.payload.view.history[data.asOf].radar);assert.deepEqual(result.payload.calculation,old.calculation);assert.deepEqual(data.history[data.asOf].values,old.view.history[data.asOf].values);assert.ok(record.validSnapshot(data,data.instrument.market,data.instrument.symbol,fixtureNow));assert.ok(Buffer.byteLength(result.payload.http.overview)<200000);}const stock=JSON.parse(f.sqlite.prepare("SELECT payload FROM market_snapshot WHERE key='US/NVDA'").get().payload);assert.ok(JSON.parse(stock.http.body).data.history[stock.view.asOf].radar);}finally{f.close();}});
test('valuation rows show only the selected exact date and never carry stale rank metadata',()=>{
 const row={name:'测试',code:'000300',date:today,pb:{value:1.2,percentile:42,from:'2020-01-01',samples:100},ps:{value:2,percentile:12}};
 assert.deepEqual(model.valuationRowsForDate([row],today),[row]);
 for(const date of ['2026-10-29','2026-10-31']){
  const missing=model.valuationRowsForDate([row],date)[0];
  assert.deepEqual(missing,{name:row.name,code:row.code,date,pb:{value:null,percentile:null},ps:{value:null,percentile:null}});
 }
 assert.equal(row.pb.value,1.2);
});
test('CN factor window displays its actual sample count including zero, not the maximum',()=>{
 const snapshot={instrument:{market:'CN',symbol:'000300.SS'},history:{},chinaOverview:{sourceIds:{rsi:'self_csi300_rsi14_tencent'},history:{[today]:{rsi:[50,null,17]}}}};
 assert.equal(model.chinaReadings(snapshot,today).rsi.period,'17天');
 snapshot.chinaOverview.history[today].rsi[2]=0;
 assert.equal(model.chinaReadings(snapshot,today).rsi.period,'0天');
 assert.equal(model.chinaReadings(snapshot,'2026-10-29').rsi.period,'—');
});
