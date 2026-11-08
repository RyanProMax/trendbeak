import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

let vite, color, stage, Valuations, palette;
before(async () => {
  vite = await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
  ({percentileColor:color,percentileStage:stage,PERCENTILE_COLORS:palette} = await vite.ssrLoadModule('/src/lib/percentile-colors.ts'));
  Valuations = (await vite.ssrLoadModule('/src/components/IndexValuations.tsx')).default;
});
after(async () => await vite?.close());
const luminance = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);

test('five shared heat stages use exact boundaries, not continuous interpolation or raw-value direction', () => {
  for (const scheme of ['light','dark']) {
    for (const [p,s] of [[0,0],[19.999,0],[20,1],[39.999,1],[40,2],[50,2],[59.999,2],[60,3],[79.999,3],[80,4],[100,4]]) {
      assert.equal(stage(p),s);
      assert.equal(color(p,scheme),palette[scheme][s]);
    }
    assert.equal(new Set(palette[scheme]).size,5);
  }
});

test('shared text/fill colors exceed text and graphic contrast on both themes including hover',()=>{
  for(const scheme of ['light','dark']) for(const c of palette[scheme]){
    for(const surface of scheme==='light'?['#ffffff','#f5f5f5','#eeeeee']:['#000000','#141414','#191919','#262626']) assert.ok(contrast(c,surface)>=4.5,`${c} on ${surface}`);
    for(const track of scheme==='light'?['#f5f5f5','#dedede']:['#141414','#303030']) assert.ok(contrast(c,track)>=3,`${c} on ${track}`);
  }
});

test('missing or invalid percentiles have no color, while both boundaries remain valid', () => {
  for (const scheme of ['light','dark']) {
    for (const p of [null,undefined,NaN,Infinity,-Infinity,-.001,100.001]) {assert.equal(color(p,scheme),undefined);assert.equal(stage(p),undefined);}
    assert.ok(color(0,scheme));assert.ok(color(100,scheme));
  }
});

test('numbers and fills share stage variables, preserving current and selected-date ranks, raw readings and widths', () => {
  const date='2026-11-06';
  for (const p of [0,12.34,20,40,50,60,80,87.65,100,null]) {
    const reading={value:1.23,percentile:p,from:'2016-11-07',through:'2026-11-05',samples:2400};
    const row={code:'000300',name:'沪深300',date,pb:{...reading},ps:{...reading,value:2.34}};
    const original=structuredClone(row);
    for (const selectedDate of [undefined,date,'2026-11-05']) {
      const dom=new JSDOM(renderToStaticMarkup(React.createElement(Valuations,{rows:[row],date:selectedDate}))),doc=dom.window.document;
      const shown=selectedDate===undefined||selectedDate===date,valid=shown&&p!==null;
      const fills=[...doc.querySelectorAll('.valuation-track i')];
      assert.equal(fills.length,valid?2:0);
      for(const fill of fills) assert.equal(fill.style.width,`${p}%`);
      for(const trigger of doc.querySelectorAll('.valuation-trigger')){
        assert.equal(trigger.dataset.percentileStage,valid?String(stage(p)):'missing');
        assert.equal(trigger.style.getPropertyValue('--percentile-light'),valid?color(p,'light'):'');
        assert.equal(trigger.style.getPropertyValue('--percentile-dark'),valid?color(p,'dark'):'');
        assert.ok(trigger.querySelector('b'));
      }
      assert.deepEqual([...doc.querySelectorAll('.valuation-reading b')].map(el=>el.textContent),[valid?`${p.toFixed(1)}%`:'—',valid?`${p.toFixed(1)}%`:'—']);
      assert.deepEqual([...doc.querySelectorAll('.valuation-reading small')].map(el=>el.textContent),shown?['1.23倍','2.34倍']:['—','—']);
      assert.equal(doc.querySelectorAll('button.valuation-help').length,2);
      assert.equal(doc.querySelectorAll('.panel-heading time').length,0);
      assert.equal(doc.querySelector('table').dataset.valuationDate,selectedDate??date);
      assert.match(doc.querySelector('table').getAttribute('aria-label'),/2026年11月/);
      dom.window.close();
    }
    assert.deepEqual(row,original);
  }
});
