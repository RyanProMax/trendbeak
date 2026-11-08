import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

test('folding preserves descendants, immediately hides interaction and publishes visibility',async()=>{
 const vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
 const dom=new JSDOM('<main id="root"></main>');
 dom.window.matchMedia=()=>({matches:false});
 const previous={};
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){previous[key]=globalThis[key];globalThis[key]=value;}
 let root;
 try {
  const {default:Panel,PanelPreferences,usePanelVisible}=await vite.ssrLoadModule('/src/components/CollapsiblePanel.tsx');
  function Child(){const visible=usePanelVisible();return React.createElement('button',{'data-visible':visible},'Chart action');}
  root=createRoot(document.querySelector('#root'));
  await act(async()=>root.render(React.createElement(PanelPreferences,null,React.createElement(Panel,{panelKey:'test',title:'Panel'},React.createElement(Child)))));
  const button=document.querySelector('h2 button'),body=document.querySelector('.panel-body'),child=document.querySelector('.panel-body-content button');
  await act(async()=>button.click());
  assert.equal(body.hasAttribute('inert'),true);
  assert.equal(body.getAttribute('aria-hidden'),'true');
  assert.equal(child.dataset.visible,'false');
  assert.equal(document.activeElement,button);
  await act(async()=>button.click());
  assert.equal(document.querySelector('.panel-body-content button'),child);
  assert.equal(child.dataset.visible,'true');
  assert.equal(body.hasAttribute('inert'),false);
  dom.window.matchMedia=()=>({matches:true});
  await act(async()=>button.click());
  assert.equal(body.dataset.animating,'false');
 } finally {
  if(root)await act(async()=>root.unmount());
  for(const [key,value] of Object.entries(previous))globalThis[key]=value;
  dom.window.close();await vite.close();
 }
});
