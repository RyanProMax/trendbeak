import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

test('AI subthemes replace broad ETF navigation without requesting ETF estimates',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}}),dom=new JSDOM('<div id="root"></div>',{url:'https://test/'});
 const keys=['window','document','fetch','IS_REACT_ACT_ENVIRONMENT','Element','HTMLElement','Node'],saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});for(const k of ['Element','HTMLElement','Node'])globalThis[k]=dom.window[k];
 const urls=[];globalThis.fetch=async url=>{urls.push(url);return Response.json({data:{date:new URL(url,'https://test/').searchParams.get('date'),rows:[]}});};let root;
 try{
  const Component=(await vite.ssrLoadModule('/src/components/USSectorValuations.tsx')).default;root=createRoot(document.querySelector('#root'));
  const render=async(date,viewMode='latest')=>{await act(async()=>root.render(React.createElement(Component,{date,viewMode})));await act(async()=>new Promise(r=>setTimeout(r,180)));};
  const labels=()=>[...document.querySelectorAll('tbody th strong')].map(e=>e.textContent),choose=async label=>act(async()=>[...document.querySelectorAll('.valuation-groups button')].find(b=>b.textContent===label).click());
  const expected=['半导体','存储','光连接','数据中心','AI 电力基建','云计算','云软件','网络安全','机器人'];
  await render('2026-11-09');assert.deepEqual(labels(),expected);
  assert.deepEqual([...document.querySelectorAll('.valuation-groups button')].map(e=>e.textContent),['AI 板块','传统行业','宽基']);
  assert.equal(urls.length,1);assert(urls.every(u=>u.startsWith('/api/valuations/US/themes?')));
  await choose('传统行业');assert.equal(document.querySelectorAll('tbody tr').length,11);
  await choose('宽基');assert.deepEqual(labels(),['标普500','纳斯达克100']);
  await choose('AI 板块');await choose('AI 板块');assert.deepEqual(labels(),expected);assert.equal(urls.length,1);
  await render('2026-11-06','historical');assert.equal(document.querySelector('table').dataset.valuationDate,'2026-11-06');assert.equal(urls.length,2);
  await render('2026-11-09');assert.deepEqual(labels(),expected);assert.equal(urls.length,2);
  assert(urls.every(u=>u.startsWith('/api/valuations/US/themes?')));assert(!/XLK|XLC|XLI|XLU|细分主题/.test(document.body.textContent));
 }finally{if(root)await act(async()=>root.unmount());for(const key of keys)globalThis[key]=saved[key];dom.window.close();await vite.close();}
});

test('retired XLK endpoint is explicitly gone and never accesses the database',async()=>{
 const app=(await import('../dist/_worker.js')).default;
 const db={prepare(){throw Error('Retired endpoint must not read D1');}};
 const response=await app.request('https://test/api/valuations/US/reported-estimate',{}, {SENTIMENT_DB:db});
 assert.equal(response.status,410);assert.deepEqual(await response.json(),{data:null});
});
