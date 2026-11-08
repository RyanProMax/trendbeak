import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let vite,MarketSwitch;
before(async()=>{
 vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});
 ({default:MarketSwitch}=await vite.ssrLoadModule('/src/components/MarketSwitch.tsx'));
});
after(async()=>vite?.close());
for(const [market,value,label] of [['CN',0,'A股'],['US',1,'美股']])test(`market switch ${market} keeps native range semantics and one decorative thumb`,()=>{
 const html=renderToStaticMarkup(React.createElement(MarketSwitch,{market,onChange(){}}));
 assert.match(html,new RegExp(`data-market="${market}"`));
 assert.match(html,/type="range"/);assert.match(html,/min="0" max="1" step="1"/);
 assert.match(html,new RegExp(`value="${value}"`));assert.match(html,new RegExp(`aria-valuetext="${label}"`));
 assert.match(html,/aria-label="切换市场"/);assert.match(html,/class="market-switch-thumb" aria-hidden="true"/);
 assert.equal((html.match(/<input /g)||[]).length,1);assert.doesNotMatch(html,/tabindex="-1"|disabled/);
});
