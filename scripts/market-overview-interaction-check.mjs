/** Isolated UI regression harness. Synthetic observations never enter app data. */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const out='artifacts/overview-interactions';await mkdir(out,{recursive:true});
const vite=await createServer({configFile:false,appType:'custom',logLevel:'error',esbuild:{jsx:'automatic'},server:{port:5194,strictPort:true}});
vite.middlewares.use('/__overview_check',async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await vite.transformIndexHtml('/__overview_check',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="main-content"><div id="root"></div></main><script type="module">
import React from 'react';import ReactDOM from'react-dom/client';import{MarketSentimentRadar}from'/src/components/ChinaSentimentRadar.tsx';import Valuations from'/src/components/IndexValuations.tsx';import '/src/styles.css';import '/src/dashboard-theme.css';import '/src/market-interactions.css';
const date='2026-11-02',keys=['fearGreed','rsi','breadth','limitRatio','turnover','relativeTurnover'],readings=Object.fromEntries(keys.map((k,i)=>[k,{date,value:i===2?null:15+i,unit:'%',percentile:i===2?null:10+i*14,period:'此前252个有效交易日（最多252日）',method:'这是保留完整说明的测试指标。',counts:k==='limitRatio'?[32,0]:undefined,source:null}]));const root=ReactDOM.createRoot(document.getElementById('root'));window.renderOverview=(nextDate=date,market='CN')=>root.render(React.createElement('div',null,React.createElement(MarketSentimentRadar,{date:nextDate,market,readings}),React.createElement(Valuations,{rows:[{name:'中小企业100',code:'399005',date,pb:{value:1.23,percentile:42},ps:{value:2.34,percentile:60}}]})));window.renderOverview();
</script><style>body{margin:0;padding:24px}#root{max-width:680px;margin:auto}button{font:inherit}.six-factor-trigger{border:0;background:transparent}@media(max-width:400px){body{padding:16px}}</style></body></html>`))});
async function valuationLayout(page,width){
 const layout=await page.locator('.index-valuations').evaluate(e=>{
  const cells=[...e.querySelectorAll('tbody tr:first-child>*')],rects=cells.map(c=>c.getBoundingClientRect()),bars=[...e.querySelectorAll('tbody tr:first-child .valuation-track')].map(c=>c.getBoundingClientRect());
  return{starts:rects.map(c=>c.x),columns:rects.map(c=>c.width),bars:bars.map(b=>b.width),gutters:cells.map(c=>parseFloat(getComputedStyle(c).paddingRight)),metricGap:bars[1].left-bars[0].right,sectionWidth:e.getBoundingClientRect().width,tableLeft:e.querySelector('table').getBoundingClientRect().left,sectionLeft:e.getBoundingClientRect().left,tableWidth:e.querySelector('table').getBoundingClientRect().width,nativeTable:getComputedStyle(e.querySelector('table')).display,nameOverflow:[...e.querySelectorAll('tbody th strong')].some(n=>n.scrollWidth>n.clientWidth),pageOverflow:document.documentElement.scrollWidth>innerWidth};
 });
 assert.equal(layout.nativeTable,'table');assert.ok(layout.tableWidth<=680.5);assert.ok(Math.abs(layout.tableWidth-layout.sectionWidth)<1,'table fills analysis measure');assert.ok(Math.abs(layout.tableLeft-layout.sectionLeft)<1,'table aligns with heading');
 assert.ok(layout.columns[0]<layout.columns[1],'name column must remain narrower than metric columns');
 assert.ok(Math.abs(layout.bars[0]-layout.bars[1])<1,'PB/PS bars must match');
 const gutter=width<=760?12:32;assert.ok(layout.gutters.every(g=>g===gutter));assert.ok(Math.abs(layout.metricGap-gutter)<1,'visible metric gutter must match name-cell gutter');
 assert.ok(layout.bars.every(w=>w>(width<=760?72:92)&&w<=225),'bars must be wider than old bounds without sprawling');
 assert.equal(layout.nameOverflow,false);assert.equal(layout.pageOverflow,false);return layout;
}
await vite.listen();const browser=await chromium.launch({channel:'chrome'}),results=[];
try{for(const scheme of ['light','dark'])for(const width of [1440,390,320]){
 const page=await browser.newPage({viewport:{width,height:900},colorScheme:scheme});const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error(e);});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.goto('http://localhost:5194/__overview_check');await page.locator('.six-factor-trigger').first().waitFor();await page.evaluate(s=>document.documentElement.dataset.theme=s,scheme);
 const buttons=page.locator('.six-factor-trigger'),dialog=page.getByRole('dialog'),height=await page.locator('.china-sentiment').evaluate(e=>e.offsetHeight);
 await buttons.nth(0).hover();assert.equal(await dialog.count(),0,'hover must not open');
 for(let i=0;i<6;i++){
  await buttons.nth(i).click();await dialog.waitFor();assert.equal(await dialog.count(),1);assert.equal(await buttons.nth(i).getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.china-sentiment').evaluate(e=>e.offsetHeight),height,'popover must not reflow');
  const b=await dialog.boundingBox();assert.ok(b.x>=11&&b.x+b.width<=width-11&&b.y>=11&&b.y+b.height<=889,JSON.stringify(b));
  assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));
  if(i===2)assert.ok((await dialog.innerText()).includes('—'));if(i===3)assert.ok((await dialog.innerText()).includes('32 / 0'));
  await page.waitForTimeout(180);await page.screenshot({path:`${out}/${width}-${scheme}-factor-${i}.png`,fullPage:true});
 }
 await buttons.nth(5).click();assert.equal(await dialog.count(),0,'same trigger toggles');
 await buttons.nth(0).focus();await buttons.nth(0).press('Enter');await dialog.waitFor();assert.equal(await page.locator('.six-factor-popover').getAttribute('data-keyboard'),'true');
 assert.deepEqual(await page.locator('.six-factor-popover').evaluate(e=>{const s=getComputedStyle(e);return [s.transitionDuration,s.opacity,s.transform]}),['0s','1','none']);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.ok(await buttons.nth(0).evaluate(e=>e===document.activeElement));
 await buttons.nth(1).press('Space');await dialog.waitFor();await page.getByRole('button',{name:'关闭指标详情'}).click();await dialog.waitFor({state:'detached'});assert.ok(await buttons.nth(1).evaluate(e=>e===document.activeElement));
 await buttons.nth(0).click();await page.mouse.click(2,2);assert.equal(await dialog.count(),0);
 await buttons.nth(0).click();await page.evaluate(()=>window.renderOverview('2026-11-03'));await dialog.waitFor({state:'detached'});
 await buttons.nth(0).click();await page.evaluate(()=>window.renderOverview('2026-11-03','US'));await dialog.waitFor({state:'detached'});
 await page.evaluate(()=>window.renderOverview());await page.emulateMedia({reducedMotion:'reduce'});await buttons.nth(0).click();await dialog.waitFor();assert.deepEqual(await page.locator('.six-factor-popover').evaluate(e=>{const s=getComputedStyle(e);return [s.transitionDuration,s.opacity,s.transform]}),['0s','1','none']);await page.keyboard.press('Escape');
 const layout=await valuationLayout(page,width);assert.deepEqual(errors,[]);results.push({width,scheme,...layout});await page.close();
}
if(process.env.SIGNAL_PREVIEW_URL)for(const scheme of ['light','dark'])for(const width of [1440,390,320]){
 const page=await browser.newPage({viewport:{width,height:900},colorScheme:scheme});await page.goto(process.env.SIGNAL_PREVIEW_URL,{waitUntil:'networkidle'});await page.locator('.index-valuations tbody tr').first().waitFor();await page.evaluate(s=>document.documentElement.dataset.theme=s,scheme);
 results.push({source:'built-preview',width,scheme,...await valuationLayout(page,width)});await page.close();
}
console.log(JSON.stringify(results,null,2));}finally{await browser.close();await vite.close();}
