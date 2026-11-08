import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let vite,MarketCard;
before(async()=>{vite=await createServer({configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,ws:false}});({default:MarketCard}=await vite.ssrLoadModule('/src/components/MarketCard.tsx'));});
after(async()=>vite?.close());
const instrument={market:'CN',kind:'index',name:'沪深300',symbol:'000300.SS',code:'000300'},date='2026-11-06';
test('loaded quotes expose no frontend refresh control',()=>{
 const snapshot={instrument,asOf:date,history:{[date]:{price:4054.28,change:-1.44}},days:[],session:'closed'};
 const html=renderToStaticMarkup(React.createElement(MarketCard,{state:{instrument,snapshot,loading:false,error:null},reset(){},retry(){}}));
 assert.match(html,/4,054.28/);assert.match(html,/收盘/);assert.doesNotMatch(html,/quote-refresh|刷新|<button/);
});
test('an unavailable snapshot still supports retrying its read',()=>{
 const html=renderToStaticMarkup(React.createElement(MarketCard,{state:{instrument,snapshot:null,loading:false,error:'unavailable'},reset(){},retry(){}}));
 assert.match(html,/重试/);assert.doesNotMatch(html,/quote-refresh|刷新/);
});
test('dashboard navigation reads snapshots without timer or visibility polling',()=>{
 const source=readFileSync('src/App.tsx','utf8');
 assert.doesNotMatch(source,/setInterval\(|visibilitychange|boundedRefresh/);
 assert.match(source,/fetchQuote\(/);assert.match(source,/ensureBenchmark\(market\)/);
});
