import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.SIGNAL_PREVIEW_URL??'http://127.0.0.1:8804',out='artifacts/session-chart-qa';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),results=[];
try{for(const scheme of ['light','dark'])for(const width of [1440,390,320]){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce'}),page=await context.newPage();
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('rect[data-date="2026-11-03"]').waitFor();
 const marketSlider=page.getByRole('slider',{name:'切换市场',exact:true});
 const switchMarket=async market=>{await marketSlider.focus();await marketSlider.press(market==='CN'?'Home':'End');await page.locator(`main[data-market="${market}"]`).waitFor();};
 const range=async()=>{const start=page.getByRole('slider',{name:'趋势起始日期',exact:true}),end=page.getByRole('slider',{name:'趋势结束日期',exact:true});await start.focus();await start.press('Home');await end.focus();await end.press('End');};
 const select=async date=>{const cell=page.locator(`rect[role="button"][data-date="${date}"]`);await cell.focus();await cell.press('Enter');};
 const hit=()=>page.locator('.chart-hit-area');
 const boxes=()=>page.locator('.readout-emotion .readout-value,.readout-price-number,.readout-change,.readout-unit').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{class:e.className,x:b.x,y:b.y,width:b.width,height:b.height,text:e.textContent,weight:s.fontWeight,space:s.whiteSpace};}));
 const compare=(a,b)=>{assert.deepEqual(a.map(({text,...r})=>r),b.map(({text,...r})=>r));};
 const layout=async label=>{const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,items:[...document.querySelectorAll('.chart-readout,.readout-price-group,.readout-price-number,.readout-change,.readout-emotion')].map(e=>{const b=e.getBoundingClientRect();return{class:e.className,left:b.left,right:b.right,scroll:e.scrollWidth,client:e.clientWidth};})}));assert.equal(result.overflow,false,label);for(const item of result.items){assert.ok(item.left>=0&&item.right<=width,JSON.stringify({label,item,width}));assert.ok(item.scroll<=item.client+1,JSON.stringify({label,item,width}));}return result;};
 await range();await select('2026-07-02');await hit().focus();await hit().press('ArrowRight');assert.equal(await page.locator('.trend-chart').getAttribute('data-active-date'),'2026-07-03');
 const beforeRange=await page.locator('.trend-range-control').getAttribute('data-start');
 await select('2026-07-24');const cnBefore=await boxes();await select('2026-07-27');const cnGap=await boxes();compare(cnBefore,cnGap);assert.equal(await page.locator('.readout-emotion .readout-value').innerText(),'—');assert.equal(await page.locator('.trend-range-control').getAttribute('data-start'),beforeRange);await layout('CN gap');await page.screenshot({path:`${out}/${width}-${scheme}-CN.png`,fullPage:true});
 await switchMarket('US');await range();await select('2026-07-02');await hit().focus();await hit().press('ArrowRight');assert.equal(await page.locator('.trend-chart').getAttribute('data-active-date'),'2026-07-06');
 // Hit-testing at the current session coordinate lands on exactly that session.
 const box=await hit().boundingBox(),index=Number(await hit().getAttribute('aria-valuenow')),last=Number(await hit().getAttribute('aria-valuemax'));await page.mouse.move(box.x+index/last*box.width,box.y+box.height/2);assert.equal(await page.locator('.trend-chart').getAttribute('data-active-date'),'2026-07-06');
 await page.mouse.move(1,1);await select('2026-07-02');const usBefore=await boxes();await select('2026-11-03');compare(usBefore,await boxes());await layout('US different returns');await page.screenshot({path:`${out}/${width}-${scheme}-US.png`,fullPage:true});
 const start=page.getByRole('slider',{name:'趋势起始日期',exact:true});const old=await page.locator('.trend-range-control').evaluate(e=>({start:e.dataset.start,end:e.dataset.end,count:+e.dataset.dayCount}));await start.focus();await start.press('ArrowRight');const next=await page.locator('.trend-range-control').evaluate(e=>({start:e.dataset.start,end:e.dataset.end,count:+e.dataset.dayCount}));assert.equal(Date.parse(next.start)-Date.parse(old.start),86400000);assert.equal(next.end,old.end);assert.equal(next.count,old.count-1);
 const search=page.getByRole('combobox',{name:'搜索股票'});await search.fill('NVDA');await page.getByRole('option').filter({hasText:'NVDA'}).click();await page.locator('.stock-technical-panel').waitFor();await range();await select('2026-07-02');const stockBefore=await boxes();assert.equal(await page.locator('.readout-unit').innerText(),'USD');await select('2026-11-03');compare(stockBefore,await boxes());await layout('NVDA variable prices');await page.screenshot({path:`${out}/${width}-${scheme}-NVDA.png`,fullPage:true});
 results.push({scheme,width,calendarMapping:true,pointerMapping:true,naturalRange:true,fixedSlots:true,cnGapBlank:true,noOverflow:true,cnGap,stockBefore});console.log(JSON.stringify({scheme,width,passed:true}));await context.close();
}await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}finally{await browser.close();}
