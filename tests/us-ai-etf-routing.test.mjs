import assert from 'node:assert/strict';import test from 'node:test';import {createServer} from 'vite';import {JSDOM} from 'jsdom';import React,{act} from 'react';import {createRoot} from 'react-dom/client';
test('AI sector ETFs are the default and existing theme groups remain reachable',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}}),dom=new JSDOM('<div id="root"></div>',{url:'https://test/'});
 const keys=['window','document','fetch','IS_REACT_ACT_ENVIRONMENT','Element','HTMLElement','Node'],saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});for(const k of ['Element','HTMLElement','Node'])globalThis[k]=dom.window[k];
 const urls=[];globalThis.fetch=async url=>{urls.push(url);return Response.json({data:url.endsWith('/current-estimate')?null:{date:'2026-11-09',rows:[]}});};let root;
 try{const Component=(await vite.ssrLoadModule('/src/components/USSectorValuations.tsx')).default;root=createRoot(document.querySelector('#root'));await act(async()=>root.render(React.createElement(Component,{date:'2026-11-09',viewMode:'latest'})));await act(async()=>new Promise(r=>setTimeout(r,180)));
 const labels=()=>[...document.querySelectorAll('tbody th small')].map(e=>e.textContent),choose=async label=>act(async()=>[...document.querySelectorAll('.valuation-groups button')].find(b=>b.textContent===label).click());
 assert.deepEqual(labels(),['XLK','XLC','XLI','XLU']);assert(urls.some(u=>u.includes('sector-methods-v7')));assert(urls.some(u=>u.endsWith('/current-estimate')));
 await choose('细分主题');await act(async()=>new Promise(r=>setTimeout(r,180)));assert.equal(document.querySelector('tbody th strong').textContent,'半导体');assert(urls.some(u=>u.includes('/themes?')));
 await choose('传统行业');assert.equal(document.querySelectorAll('tbody tr').length,11);await choose('宽基');assert.equal(document.querySelectorAll('tbody tr').length,2);await choose('AI 板块');assert.deepEqual(labels(),['XLK','XLC','XLI','XLU']);
 }finally{if(root)await act(async()=>root.unmount());for(const key of keys)globalThis[key]=saved[key];dom.window.close();await vite.close();}
});
