import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

test('session pointer and keyboard mapping share chart geometry; price and return slots persist for missing dates',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
 const dom=new JSDOM('<div id="main-content"><div id="root"></div><div class="trend-heading-readout" id="readout"></div></div>',{url:'https://test/'}),previous={};
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}})){previous[key]=globalThis[key];globalThis[key]=value;}
 dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({width:584,left:0});
 dom.window.SVGElement.prototype.getBoundingClientRect=()=>({width:584,left:0});
 dom.window.SVGElement.prototype.setPointerCapture=()=>{};
 let root;
 try{
  const Trend=(await vite.ssrLoadModule('/src/components/MarketTrend.tsx')).default;
  const snapshot={instrument:{market:'US',kind:'stock',name:'Apple',code:'AAPL'},currency:'USD',days:[],history:{'2026-10-23':{price:9.01,change:-.01},'2026-10-26':{price:100.10,change:101.12},'2026-10-28':{price:99.99,change:0}}};
  let hoveredDate=null,selectedDate='2026-10-23';
  const render=()=>root.render(React.createElement(Trend,{snapshot,benchmark:null,bounds:{start:'2026-10-23',end:'2026-10-28'},windowEnd:'2026-10-28',selectedDate,hoveredDate,range:6,visible:{mood:true,index:true},dateSelected:true,onHoverDate:date=>{hoveredDate=date;render();},onSelectDate:date=>{selectedDate=date;render();},canSelectDate:()=>true,readoutTarget:document.querySelector('#readout')}));
  root=createRoot(document.querySelector('#root'));await act(async()=>render());
  const slider=()=>document.querySelector('.chart-hit-area'),key=async key=>act(async()=>slider().dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true})));
  const slots=()=>[...document.querySelector('.readout-price-group').children].map(el=>el.className);
  const initialSlots=slots();assert.deepEqual(initialSlots,['readout-price-number','readout-unit','readout-change']);assert.equal(document.querySelector('.readout-unit').textContent,' USD');
  await key('ArrowRight');assert.equal(hoveredDate,'2026-10-26');assert.equal(slider().getAttribute('aria-valuenow'),'1');
  assert.equal(document.querySelector('.readout-change').textContent,' (+101.12%)');assert.deepEqual(slots(),initialSlots);
  await key('ArrowRight');assert.equal(hoveredDate,'2026-10-27');assert.equal(document.querySelector('.readout-price-number').textContent,'—');assert.deepEqual(slots(),initialSlots);assert.equal(document.querySelector('.readout-change').textContent,'\u00a0');
  await key('Home');assert.equal(hoveredDate,'2026-10-23');await key('End');assert.equal(hoveredDate,'2026-10-28');await key('Enter');assert.equal(selectedDate,'2026-10-28');
  // Pixel location of session index 1, not the intervening weekend.
  const event=new window.Event('pointerdown',{bubbles:true});Object.assign(event,{button:0,clientX:34+(516-34)/3,clientY:50,pointerId:1});await act(async()=>slider().dispatchEvent(event));assert.equal(hoveredDate,'2026-10-26');
  assert.equal(document.querySelector('.trend-chart').dataset.sessionCount,'4');
 }finally{
  if(root)await act(async()=>root.unmount());for(const [key,value]of Object.entries(previous))globalThis[key]=value;dom.window.close();await vite.close();
 }
});
