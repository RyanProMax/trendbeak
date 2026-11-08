import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';

let vite, Radar;
before(async () => {
  vite = await createServer({configFile:false, appType:'custom', server:{middlewareMode:true, hmr:false, ws:false}});
  Radar = (await vite.ssrLoadModule('/src/components/TechnicalRadar.tsx')).default;
});
after(async () => await vite?.close());

const date = '2026-10-30';
function fixture(score) {
  return {
    instrument:{market:'US',kind:'stock',symbol:'NVDA',name:'NVIDIA Corporation'},
    technicalSource:'trendbeak_technical_v1', asOf:date, session:'closed',
    days:[{date,status:'trading'}], signals:[],
    source:{name:'Yahoo Finance',url:'https://finance.yahoo.com/quote/NVDA/history/'},
    history:{[date]:{
      values:{rsi:score}, previous:{rsi:50},
      radar:{version:1,bollinger:{position:50,middleChange:0,widthChange:0},
        ...Object.fromEntries(['ema','volatility','activity'].map(id => [id,
          {value:score,score,strength:score,samples:252,asOf:date}]))}
    }}
  };
}

test('brand gradient stays on the full background and never follows ranks or missing values', () => {
  const backgrounds = [10,90,null].map(score => {
    const doc = new JSDOM(renderToStaticMarkup(React.createElement(Radar,{snapshot:fixture(score),date}))).window.document;
    const base = doc.querySelector('.radar-base'), wash = doc.querySelector('.radar-brand-background');
    assert.equal(wash.getAttribute('points'),base.getAttribute('points'));
    assert.equal(wash.getAttribute('aria-hidden'),'true');
    assert.equal(base.nextElementSibling,wash);
    assert.ok(wash.nextElementSibling.classList.contains('radar-grid'));
    const gradient = doc.getElementById(wash.getAttribute('fill').slice(5,-1));
    assert.ok(gradient);
    assert.equal(doc.querySelectorAll('.radar-axis').length,4);
    assert.equal(doc.querySelectorAll('[data-radar-point]').length,score===null?0:4);
    assert.equal(doc.querySelectorAll('.radar-shape').length,score===null?0:1);
    assert.match(doc.querySelector('desc').textContent,/波动和量能不表示多空/);
    assert.match(doc.querySelector('desc').textContent,/背景渐变仅作装饰，不对应多空方向/);
    return {points:wash.getAttribute('points'),vector:['x1','y1','x2','y2'].map(key=>gradient.getAttribute(key)),
      stops:[...gradient.querySelectorAll('stop')].map(stop=>[stop.getAttribute('offset'),stop.getAttribute('stop-color')])};
  });
  assert.deepEqual(backgrounds[0],backgrounds[1]);
  assert.deepEqual(backgrounds[0],backgrounds[2]);
  assert.deepEqual(backgrounds[0].vector,['0%','0%','100%','0%']);
  assert.deepEqual(backgrounds[0].stops,[[null,'#4f9d83'],['50%','#c8bd83'],['100%','#cb7774']]);
});

test('each radar has an independent background gradient reference', () => {
  const doc = new JSDOM(renderToStaticMarkup(React.createElement(React.Fragment,null,
    ...[10,90].map(score=>React.createElement(Radar,{key:score,snapshot:fixture(score),date}))))).window.document;
  const fills = [...doc.querySelectorAll('.radar-brand-background')].map(wash=>wash.getAttribute('fill'));
  assert.equal(new Set(fills).size,2);
  for (const fill of fills) assert.ok(doc.getElementById(fill.slice(5,-1)));
});
