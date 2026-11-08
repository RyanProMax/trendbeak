import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

let vite, color, Valuations, COLORS, DARK_COLORS;
before(async () => {
  vite = await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
  ({valuationPercentileColor:color} = await vite.ssrLoadModule('/src/lib/valuation-colors.ts'));
  ({COLORS,DARK_COLORS} = await vite.ssrLoadModule('/src/lib/heatmap-colors.ts'));
  Valuations = (await vite.ssrLoadModule('/src/components/IndexValuations.tsx')).default;
});
after(async () => await vite?.close());
const channels = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const luminance = hex => channels(hex).map(v => v/255).map(v => v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);

test('valuation colors follow green, warm midpoint and red with a continuous transition', () => {
  for (const scheme of ['light','dark']) {
    const stops = scheme==='light' ? [COLORS[0],'#9a885b',COLORS[8]] : [DARK_COLORS[0],'#c8bd83',DARK_COLORS[8]];
    assert.deepEqual([0,50,100].map(p=>color(p,scheme)),stops);
    for (const [p,a,b] of [[25,stops[0],stops[1]],[75,stops[1],stops[2]]]) {
      assert.deepEqual(channels(color(p,scheme)),channels(a).map((v,i)=>Math.round((v+channels(b)[i])/2)));
    }
    for (const p of [.001,49.999,50.001,99.999]) {
      const endpoint=p<1?0:p>99?100:50;
      assert.ok(channels(color(p,scheme)).every((v,i)=>Math.abs(v-channels(color(endpoint,scheme))[i])<=1));
    }
    // A thin filled bar stays visible on the actual theme track at every rank.
    const track=luminance(scheme==='light'?'#f5f5f5':'#141414');
    for(let p=0;p<=100;p+=.5){const fill=luminance(color(p,scheme));assert.ok((Math.max(fill,track)+.05)/(Math.min(fill,track)+.05)>=3,`${scheme} ${p}`);}
  }
});

test('missing or invalid percentiles have no color, while both boundaries remain valid', () => {
  for (const scheme of ['light','dark']) {
    for (const p of [null,undefined,NaN,Infinity,-Infinity,-.001,100.001]) assert.equal(color(p,scheme),undefined);
    assert.ok(color(0,scheme));assert.ok(color(100,scheme));
  }
});

test('decoration preserves current and selected-date ranks, raw readings, widths and missing states', () => {
  const date='2026-11-06';
  for (const p of [0,12.34,50,87.65,100,null]) {
    const reading={value:1.23,percentile:p,from:'2016-11-07',through:'2026-11-05',samples:2400};
    const row={code:'000300',name:'沪深300',date,pb:{...reading},ps:{...reading,value:2.34}};
    const original=structuredClone(row);
    for (const selectedDate of [undefined,date,'2026-11-05']) {
      const doc=new JSDOM(renderToStaticMarkup(React.createElement(Valuations,{rows:[row],date:selectedDate}))).window.document;
      const shown=selectedDate===undefined||selectedDate===date;
      const valid=shown&&p!==null;
      const fills=[...doc.querySelectorAll('.valuation-track i')];
      assert.equal(fills.length,valid?2:0);
      for(const fill of fills){assert.equal(fill.style.width,`${p}%`);assert.equal(fill.style.getPropertyValue('--valuation-fill-light'),color(p,'light'));assert.equal(fill.style.getPropertyValue('--valuation-fill-dark'),color(p,'dark'));}
      assert.deepEqual([...doc.querySelectorAll('.valuation-reading b')].map(el=>el.textContent),[valid?`${p.toFixed(1)}%`:'—',valid?`${p.toFixed(1)}%`:'—']);
      assert.deepEqual([...doc.querySelectorAll('.valuation-reading small')].map(el=>el.textContent),shown?['1.23倍','2.34倍']:['—','—']);
      assert.ok([...doc.querySelectorAll('.valuation-reading b')].every(el=>!el.hasAttribute('style')));
      assert.equal(doc.querySelectorAll('button.valuation-trigger').length,2);
      assert.equal(doc.querySelectorAll('button.valuation-help').length,2);
    }
    assert.deepEqual(row,original);
  }
});
