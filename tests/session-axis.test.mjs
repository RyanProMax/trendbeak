import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {createServer} from 'vite';
let vite, axis, series;
before(async()=>{vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false}});axis=(await vite.ssrLoadModule('/src/lib/session-axis.ts')).sessionAxis;series=await vite.ssrLoadModule('/src/lib/chart-series.ts');});
after(async()=>await vite?.close());
const snapshot=(market)=>({instrument:{market,kind:'index'},days:[],history:{}});
test('only exchange closures compress; missing weekdays stay evenly spaced and inspectable',()=>{
 const us=snapshot('US'),days=series.calendarForRange(us,'2026-10-28',6),a=axis(days);
 assert.deepEqual(a.dates,['2026-10-23','2026-10-26','2026-10-27','2026-10-28']);
 assert.equal(a.fraction('2026-10-26'),1/3);assert.equal(a.fraction('2026-10-27'),2/3);
 for(const date of a.dates) assert.equal(a.fromFraction(a.fraction(date)),date);
 assert.equal(a.step('2026-10-23',1),'2026-10-26');assert.equal(a.step('2026-10-26',-1),'2026-10-23');
 assert.equal(a.step('2026-10-25',1),'2026-10-26');assert.equal(a.step('2026-10-25',-1),'2026-10-23');
 assert.equal(a.fromFraction(-1),a.at(0));assert.equal(a.fromFraction(2),a.at(a.last));
});
test('CN and US calendars differ while preserving the actual selected interval',()=>{
 for(const [market,holiday,open] of [['CN','2026-10-01','2026-07-03'],['US','2026-07-03','2026-10-01']]){
  const s=snapshot(market),closed=series.trendSeries(s,s,holiday,7),available=series.trendSeries(s,s,open,7);
  assert.equal(closed.end,holiday);assert.equal(closed.days.length,7);assert.equal(axis(closed.days).contains(holiday),false);
  assert.equal(axis(available.days).contains(open),true);
 }
});
test('fixed full-path affine transforms agree with window-local session positions across weekends and holidays',()=>{
 for(const market of ['CN','US']){
  const all=series.calendarForRange(snapshot(market),'2026-11-06',365),full=axis(all);
  for(const end of ['2026-10-04','2026-10-09','2026-07-05','2026-11-06'])for(const count of [7,30,90,180]){
   const start=series.shiftDate(end,1-count),local=axis(all.filter(day=>day.date>=start&&day.date<=end));
   if(!local.dates.length)continue;
   const scale=Math.max(1,full.last)/Math.max(1,local.last),offset=full.index(local.at(0))/Math.max(1,local.last);
   for(const date of local.dates)assert.ok(Math.abs(full.fraction(date)*scale-offset-local.fraction(date))<1e-12);
  }
 }
});
test('empty and singleton windows are finite and cannot fabricate an inspectable date',()=>{
 const empty=axis([{date:'2026-10-25',status:'closed'}]);assert.equal(empty.fromFraction(.5),null);assert.equal(empty.at(0),null);
 const single=axis([{date:'2026-10-26',status:'missing'}]);assert.equal(single.fraction('2026-10-26'),0);assert.equal(single.step('2026-10-26',1),'2026-10-26');
});
test('closed observations are excluded but missing sessions split real prices',()=>{
 const s=snapshot('US');s.history={'2026-10-23':{price:10},'2026-10-24':{price:11},'2026-10-28':{price:12}};
 const result=series.trendSeries(s,s,'2026-10-28',6);
 assert.deepEqual(result.prices.map(p=>p.date),['2026-10-23','2026-10-28']);
 assert.deepEqual(result.priceSegments.map(segment=>segment.length),[1,1]);
 assert.equal(axis(result.days).contains('2026-10-27'),true);
});
