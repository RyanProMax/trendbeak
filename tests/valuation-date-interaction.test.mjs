import assert from'node:assert/strict';import test from'node:test';import{createServer}from'vite';import{JSDOM}from'jsdom';import React,{act}from'react';import{createRoot}from'react-dom/client';
test('date switches abort old reads, discard late replies and reset without stale values',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}}),dom=new JSDOM('<div id="root"></div>',{url:'https://test/'}),saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const globals=Object.fromEntries(['Element','HTMLElement','Node'].map(k=>[k,globalThis[k]]));for(const k of Object.keys(globals))globalThis[k]=dom.window[k];
 const requests=[];globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));let root;
 try{
  const Component=(await vite.ssrLoadModule('/src/components/IndexValuations.tsx')).default;
  root=createRoot(document.querySelector('#root'));const row={code:'000300',name:'沪深300',date:'2026-10-30',pb:{value:1.23,percentile:22.3},ps:{value:2,percentile:33}};
  const render=async (date,reading=row)=>{await act(async()=>root.render(React.createElement(Component,{rows:[reading],date})));};
  await render('2026-10-29');assert.ok(!document.body.textContent.includes('22.3%'));
  await act(async()=>new Promise(r=>setTimeout(r,170)));assert.equal(requests.length,1);
  await render('2026-10-28');assert.equal(requests[0].options.signal.aborted,true);
  await act(async()=>new Promise(r=>setTimeout(r,170)));assert.equal(requests.length,2);
  await act(async()=>requests[1].resolve(Response.json({data:{date:'2026-10-28',rows:[{...row,name:'历史来源中的较长官方指数名称',date:'2026-10-28',pb:{value:3,percentile:75}}]}})));
  assert.ok(document.body.textContent.includes('75.0%'));assert.equal(document.querySelector('tbody th strong').textContent,'沪深300');assert.ok(!document.body.textContent.includes('历史来源中的较长官方指数名称'));
  const realNow=Date.now;
  try{Date.now=()=>realNow()+300001;await render('2026-10-28');assert.ok(document.body.textContent.includes('75.0%'));assert.equal(document.querySelector('.valuation-status').textContent.trim(),'');}finally{Date.now=realNow;}
  await render('2026-10-28',{...row,date:'2026-10-28',pb:{value:4,percentile:88}});assert.ok(document.body.textContent.includes('88.0%'));assert.ok(!document.body.textContent.includes('75.0%'));
  await render('2026-10-28');

  await act(async()=>requests[0].resolve(Response.json({data:{date:'2026-10-29',rows:[{...row,date:'2026-10-29'}]}})));
  assert.ok(document.body.textContent.includes('75.0%'));assert.ok(!document.body.textContent.includes('22.3%'));
  await render('2026-10-30');assert.ok(document.body.textContent.includes('22.3%'));assert.ok(!document.body.textContent.includes('75.0%'));
  assert.equal(document.querySelector('.valuation-status').textContent.trim(),'');
  await render('2026-10-28');assert.ok(document.body.textContent.includes('75.0%'));
  await act(async()=>new Promise(r=>setTimeout(r,170)));assert.equal(requests.length,2);
  await render('2026-10-27');await act(async()=>new Promise(r=>setTimeout(r,170)));
  await act(async()=>requests[2].resolve(Response.json({error:'failure'},{status:503})));
  assert.equal(document.querySelector('.valuation-status').textContent,'估值数据暂不可用');assert.ok(!document.body.textContent.includes('该日期暂无估值数据'));
  try{Date.now=()=>realNow()+30001;await render('2026-10-27');assert.equal(document.querySelector('.valuation-status').textContent,'估值数据暂不可用');}finally{Date.now=realNow;}

  await render('2026-10-26');await act(async()=>new Promise(r=>setTimeout(r,170)));
  await act(async()=>requests[3].resolve(Response.json({data:{date:'2026-10-26',rows:[]}})));
  assert.equal(document.querySelector('.valuation-status').textContent,'该日期暂无估值数据');
  await render('2026-10-30');assert.equal(document.querySelector('.valuation-status').textContent.trim(),'');
  await render('2026-10-27');await act(async()=>new Promise(r=>setTimeout(r,170)));assert.equal(requests.length,4);assert.equal(document.querySelector('.valuation-status').textContent,'估值数据暂不可用');

 }finally{if(root)await act(async()=>root.unmount());globalThis.window=saved.window;globalThis.document=saved.document;globalThis.fetch=saved.fetch;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;for(const [k,v]of Object.entries(globals))globalThis[k]=v;dom.window.close();await vite.close();}
});
