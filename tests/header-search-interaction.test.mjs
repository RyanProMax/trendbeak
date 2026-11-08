import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

test('search reflects only authoritative selections, preserves failed selections, clears to benchmark and follows market navigation', async () => {
 const vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test/'});
 dom.window.HTMLElement.prototype.attachEvent=()=>{};
 dom.window.HTMLElement.prototype.detachEvent=()=>{};
 const previous={};
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})) {previous[key]=globalThis[key];globalThis[key]=value;}
 let root;
 try {
  const Search=(await vite.ssrLoadModule('/src/components/StockSearch.tsx')).default;
  const {HISTORY_KEY}=await vite.ssrLoadModule('/src/lib/search-history.ts');
  const cn={market:'CN',symbol:'600000.SS',name:'测试甲',code:'TEST',kind:'stock'};
  const us={market:'US',symbol:'TEST',name:'测试乙',code:'TEST',kind:'stock'};
  localStorage.setItem(HISTORY_KEY,JSON.stringify([us]));
  let selected=cn,clears=0,success=false;
  const render=()=>React.createElement(Search,{selectedInstrument:selected,onClear:()=>clears++,onSelect:async()=>success});
  root=createRoot(document.querySelector('#root'));
  await act(async()=>root.render(render()));
  const input=()=>document.querySelector('input');
  assert.equal(input().value,'测试甲 · TEST');
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'/',bubbles:true})));
  // Focus via the native event also covers the browser's command-key path.
  await act(async()=>input().dispatchEvent(new window.FocusEvent('focusin',{bubbles:true})));
  assert.equal(input().value,'测试甲 · TEST');
  const option=document.querySelector('[role="option"]');
  assert.ok(option);
  await act(async()=>option.click());
  assert.equal(input().value,'测试甲 · TEST','failed selection cannot impersonate the requested stock');
  selected=us;
  await act(async()=>root.render(render()));
  assert.equal(input().value,'测试乙 · TEST','same display code in a different market updates identity');
  await act(async()=>document.querySelector('[aria-label="清空股票，返回大盘"]').click());
  assert.equal(clears,1);
  assert.equal(input().value,'测试乙 · TEST','clear waits for authoritative state instead of fabricating a successful reset');
  selected={...cn,kind:'index',name:'基准'};
  await act(async()=>root.render(render()));
  assert.equal(input().value,'');
 } finally {
  if(root)await act(async()=>root.unmount());
  for(const [key,value] of Object.entries(previous))globalThis[key]=value;
  dom.window.close();await vite.close();
 }
});

test('header stays in document flow and valuation help buttons are outside panel toggle',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
 try {
  const Header=(await vite.ssrLoadModule('/src/components/StickyHeader.tsx')).default;
  assert.match(renderToStaticMarkup(React.createElement(Header,null,'content')),/sticky-header-backdrop/);
  const Valuations=(await vite.ssrLoadModule('/src/components/IndexValuations.tsx')).default;
  const dom=new JSDOM(renderToStaticMarkup(React.createElement(Valuations,{rows:[]})));
  assert.equal(dom.window.document.querySelectorAll('thead .valuation-help').length,2);
  assert.equal(dom.window.document.querySelectorAll('button button').length,0);
  for(const button of dom.window.document.querySelectorAll('.valuation-help')) assert.equal(button.getAttribute('aria-expanded'),'false');
  dom.window.close();
 }finally{await vite.close();}
});
