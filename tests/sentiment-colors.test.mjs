import assert from 'node:assert/strict';
import test, {before,after} from 'node:test';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';

let vite,Radar,CN,US,colors,updater;
before(async()=>{
  vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
  Radar=(await vite.ssrLoadModule('/src/components/ChinaSentimentRadar.tsx')).MarketSentimentRadar;
  CN=await vite.ssrLoadModule('/src/lib/china-overview.ts');
  US=await vite.ssrLoadModule('/src/lib/us-overview.ts');
  colors=await vite.ssrLoadModule('/src/lib/percentile-colors.ts');
  updater=await vite.ssrLoadModule('/src/server/us-overview.ts');
});
after(async()=>vite?.close());
const date='2026-11-06';
const render=(readings,market='CN',selected=date)=>new JSDOM(renderToStaticMarkup(React.createElement(Radar,{readings,date:selected,market,labels:market==='CN'?CN.CHINA_FACTOR_LABELS:US.US_LABELS})));
function cnReadings(ranks=[0,20,40,60,80,100]) {
  const cells=Object.fromEntries(CN.CHINA_FACTORS.map((key,i)=>[key,[[22.08,31,45,1.2,12345,.3][i],ranks[i],252]]));
  return CN.chinaReadings({instrument:{market:'CN',symbol:'000300.SS'},chinaOverview:{sourceIds:{},history:{[date]:cells}},history:{}},date);
}
function checkColors(doc,readings){
  for(const [key,r] of Object.entries(readings)){
    const button=doc.querySelector(`[data-radar-axis="${key}"]`),point=doc.querySelector(`[data-factor="${key}"]`);
    assert.equal(button.dataset.percentileStage,String(colors.percentileStage(r.percentile)??'missing'));
    for(const scheme of ['light','dark']){
      assert.equal(button.style.getPropertyValue(`--percentile-${scheme}`),colors.percentileColor(r.percentile,scheme)??'');
      if(point) assert.equal(point.style.getPropertyValue(`--percentile-${scheme}`),colors.percentileColor(r.percentile,scheme));
    }
  }
  for(const edge of doc.querySelectorAll('.six-factor-edge')){
    for(const [i,key] of [edge.dataset.from,edge.dataset.to].entries()) for(const scheme of ['light','dark']) assert.equal(edge.children[i].style.getPropertyValue(`--percentile-${scheme}`),colors.percentileColor(readings[key].percentile,scheme));
  }
}
test('six-factor radar points, real edges, readings and bars share the supplied heat stage',()=>{
  const readings=cnReadings(),original=structuredClone(readings),dom=render(readings),doc=dom.window.document;
  checkColors(doc,readings);
  assert.equal(doc.querySelectorAll('.six-factor-point').length,6);
  assert.equal(doc.querySelectorAll('.six-factor-edge').length,6);
  assert.equal(doc.querySelectorAll('.six-factor-edge path').length,12);
  assert.equal(doc.querySelectorAll('.six-factor-area').length,1);
  assert.equal(doc.querySelectorAll('.panel-heading time').length,0);
  assert.match(doc.querySelector('.china-sentiment').getAttribute('aria-label'),/2026年11月6日/);
  for(const [key,r] of Object.entries(readings)) assert.equal(doc.querySelector(`[data-radar-axis="${key}"] .six-factor-track>span`).style.width,`${r.percentile}%`);
  assert.deepEqual(readings,original);dom.window.close();
});
test('CN amount, breadth and turnover retain historical-rank colors independent of raw size or sign',()=>{
  const readings=cnReadings([90,90,5,90,5,95]),dom=render(readings),doc=dom.window.document;
  checkColors(doc,readings);
  assert.equal(doc.querySelector('[data-radar-axis="turnover"] .radar-value').textContent,'1.23万亿元');
  assert.equal(doc.querySelector('[data-radar-axis="relativeTurnover"] .radar-value').textContent,'0.30倍');
  assert.equal(doc.querySelector('[data-radar-axis="breadth"] .radar-value').textContent,'45.0%');
  assert.equal(doc.querySelector('[data-radar-axis="turnover"]').dataset.percentileStage,'0');
  assert.equal(doc.querySelector('[data-radar-axis="relativeTurnover"]').dataset.percentileStage,'4');
  assert.match(doc.querySelector('[data-radar-axis="breadth"]').textContent,/历史分位5.0%/);
  dom.window.close();
});
test('prepared US VIX/options/credit inversions are applied exactly once upstream, not again in colors',()=>{
  const day=i=>new Date(Date.parse(date)-(100-i)*86400000).toISOString().slice(0,10);
  for(const descending of [false,true]){
    const rows=Array.from({length:101},(_,i)=>{const n=descending?101-i:i+1;return{date:day(i),values:[i%100,n,n,n/100,n,n/1000]};});
    const view=updater.updateUSOverview(rows,date).view;
    const readings=US.usReadings({instrument:{market:'US',symbol:'^GSPC'},usOverview:view},date),original=structuredClone(readings),dom=render(readings,'US'),doc=dom.window.document;
    checkColors(doc,readings);
    for(const key of ['putCall','vix','creditSpread']){
      assert.equal(readings[key].percentile,descending?100:0);
      assert.equal(doc.querySelector(`[data-radar-axis="${key}"]`).dataset.percentileStage,descending?'4':'0');
      assert.match(doc.querySelector(`[data-radar-axis="${key}"]`).textContent,/风险偏好分位/);
    }
    assert.deepEqual(readings,original);dom.window.close();
  }
});
test('missing, invalid, stale and closed data stay neutral; gaps never close a polygon or bridge neighbors',()=>{
  for(const patch of [{percentile:null},{percentile:NaN},{percentile:101},{percentile:-1},{date:'2026-11-05'}]){
    const readings=cnReadings();Object.assign(readings.breadth,patch);const dom=render(readings),doc=dom.window.document;
    assert.equal(doc.querySelectorAll('.six-factor-area').length,0);
    assert.equal(doc.querySelectorAll('.six-factor-point').length,5);
    assert.equal(doc.querySelectorAll('.six-factor-edge').length,4);
    assert.equal(doc.querySelectorAll('[data-from="breadth"],[data-to="breadth"]').length,0);
    const button=doc.querySelector('[data-radar-axis="breadth"]');
    assert.equal(button.dataset.percentileStage,'missing');
    assert.equal(button.style.getPropertyValue('--percentile-light'),'');
    assert.equal(button.querySelector('.six-factor-track>span'),null);
    dom.window.close();
  }
  const dom=render(cnReadings(),'CN','2026-11-07'),doc=dom.window.document;
  assert.equal(doc.querySelectorAll('.six-factor-point,.six-factor-edge,.six-factor-area').length,0);
  assert.ok([...doc.querySelectorAll('.six-factor-trigger')].every(e=>e.dataset.percentileStage==='missing'));
  dom.window.close();
});
