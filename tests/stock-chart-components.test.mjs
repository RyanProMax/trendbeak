import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
let vite,Trend;
before(async()=>{vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false}});Trend=(await vite.ssrLoadModule('/src/components/MarketTrend.tsx')).default;});
after(async()=>await vite?.close());
function stock(market){return {instrument:{market,kind:'stock',name:market==='US'?'Apple':'贵州茅台',symbol:market==='US'?'AAPL':'600519.SS',code:market==='US'?'AAPL':'600519'},currency:market==='US'?'USD':'CNY',asOf:'2026-10-30',days:[{date:'2026-10-29',status:'trading'},{date:'2026-10-30',status:'trading'}],history:{'2026-10-29':{price:10.12,change:-.5},'2026-10-30':{price:10.42,change:1.5}},sentiment:{observations:[{date:'2026-10-30',value:88}]}};}
for(const market of ['CN','US'])test(`${market} stock chart labels and geometry never identify its prices as benchmark emotion`,()=>{
 const snapshot=stock(market),benchmark={...snapshot,instrument:{...snapshot.instrument,kind:'index',name:'Benchmark'},history:{'2026-10-29':{price:4000},'2026-10-30':{price:4100}}};
 const doc=new JSDOM(renderToStaticMarkup(React.createElement(Trend,{snapshot,benchmark,bounds:{start:'2026-10-29',end:snapshot.asOf},windowEnd:snapshot.asOf,selectedDate:snapshot.asOf,hoveredDate:null,range:2,visible:{mood:true,index:true},onHoverDate:()=>{},onSelectDate:()=>{},canSelectDate:()=>true,readoutTarget:null}))).window.document;
 assert.equal(doc.querySelector('[data-series="stock"]')!==null,true);
 assert.equal(doc.querySelector('[data-series="sentiment"]'),null);
 assert.equal(doc.querySelector('.trend-chart').dataset.emotionObservations,'0');
 assert.ok(Number(doc.querySelector('.trend-chart').dataset.priceMax)<11);
 assert.match(doc.querySelector('.chart-axis-head').textContent,market==='US'?/股价 · 美元/:/股价 · 元/);
 assert.match(doc.querySelector('[role="slider"]').getAttribute('aria-valuetext'),new RegExp(snapshot.instrument.name));
 assert.doesNotMatch(doc.querySelector('[role="slider"]').getAttribute('aria-valuetext'),/情绪|Benchmark/);
 assert.match(doc.querySelector('[role="slider"]').getAttribute('aria-valuetext'),/\(\+1\.50%\)/);
});
