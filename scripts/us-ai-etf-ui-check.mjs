// Read-only browser acceptance against a local or already-published review URL.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launch,base,out} from './signal-check-utils.mjs';
import publication from '../data/us-etf-current-publication.json' with {type:'json'};
const currentReading=JSON.parse(publication.entry.preparedReading),format=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const browser=await launch(),results=[];
try{
 for(const width of [1440,390])for(const scheme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce',isMobile:width===390,hasTouch:width===390});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?market=US',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const panel=()=>page.locator('[data-panel="us-valuations"]');await panel().locator('.valuation-status').filter({hasNotText:'正在读取'}).waitFor();
  const capture=async (name, expanded=false)=>{
   if(!expanded)await page.mouse.move(0,0);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('[data-panel="us-valuations"],.valuation-groups,.valuation-groups button,[data-panel="us-valuations"] th,[data-panel="us-valuations"] td,.valuation-tooltip,.overview-detail')].filter(e=>e.checkVisibility()).flatMap(e=>{const r=e.getBoundingClientRect();return r.left< -1||r.right>innerWidth+1||e.scrollWidth>e.clientWidth+1?[e.className]:[];})}));
   assert.deepEqual(check,{overflow:false,clipped:[]},name);if(expanded){assert.equal(await page.locator('.overview-detail').count(),1);await page.locator('.overview-detail').screenshot({path:`${out}/${width}-${scheme}-${name}-detail.png`});}await page.screenshot({path:`${out}/${width}-${scheme}-${name}-full.png`,fullPage:true});
   if(await panel().count())await panel().screenshot({path:`${out}/${width}-${scheme}-${name}-panel.png`});
  };
  assert.deepEqual(await panel().locator('tbody th strong').allTextContents(),['信息技术','通信服务','工业','公用事业']);
  const rows=panel().locator('tbody tr'),xli=rows.filter({hasText:'XLI'});
  assert.deepEqual(await xli.locator('td b').allTextContents(),['pb','ps'].map(metric=>format.format(currentReading.metrics[metric].value)));
  assert.deepEqual(await rows.filter({hasText:'XLK'}).locator('td b').allTextContents(),['—','—']);
  assert.equal(await rows.filter({hasText:'XLK'}).getByRole('button').count(),0);
  assert.deepEqual(await rows.filter({hasText:'XLC'}).locator('td b').allTextContents(),['3.24','—']);
  assert.equal(await rows.filter({hasText:'XLC'}).getByRole('button',{name:/PS/}).count(),0);
  for(const code of ['XLK','XLC','XLU'])assert.match(await rows.filter({hasText:code}).locator('th').innerText(),/2026.*6.*30/);
  await capture('ai-latest');
  for(const metric of ['PB','PS']){await panel().getByRole('button',{name:`XLI ${metric} 披露持仓重估说明`,exact:true}).click();await page.locator('.valuation-tooltip').waitFor();assert.match(await page.locator('.valuation-tooltip').innerText(),/并非当前基金持仓或净值/);await capture('xli-'+metric);await page.keyboard.press('Escape');await page.mouse.move(0,0);}
  for(const label of ['细分主题','传统行业','宽基','AI 板块']){await panel().getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(400);await capture('group-'+label);}
  const toggle=panel().locator('.panel-heading h2 button');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await capture('reopened');
  const cell=page.locator('rect[role="button"][data-date="2026-11-05"]');await cell.focus();await cell.press('Enter');await panel().locator('.valuation-status').filter({hasText:'季度持仓估算'}).waitFor();assert.equal(await panel().getByRole('button',{name:'XLI PB 披露持仓重估说明',exact:true}).count(),0);await capture('historical-no-current-carry');
  for(const market of ['US','CN']){
   const slider=page.getByRole('slider',{name:'切换市场',exact:true});await slider.focus();await slider.press(market==='US'?'End':'Home');await page.locator(`main[data-market="${market}"]`).waitFor();await page.locator('.six-factor-trigger').first().waitFor();
   for(const axis of market==='US'?['fearGreed','priceStrength','breadth','putCall','vix','creditSpread']:['fearGreed','rsi','breadth','limitRatio','turnover','relativeTurnover']){const trigger=page.locator(`.six-factor-trigger[data-radar-axis="${axis}"]`);await trigger.evaluate(e=>e.scrollIntoView({block:'center'}));await trigger.click();await page.locator('.overview-detail').waitFor();await page.waitForFunction(()=>{const e=document.querySelector('.overview-detail');if(!e)return false;const r=e.getBoundingClientRect();return e.scrollHeight<=e.clientHeight+1&&r.top>=0&&r.bottom<=innerHeight;});await capture(market+'-'+axis,true);await page.keyboard.press('Escape');await page.mouse.move(0,0);assert.equal(await page.locator('.overview-detail').count(),0);}
  }
  assert.deepEqual(errors,[]);results.push({width,scheme,aiETFs:true,actualCurrentAsOf:true,quarterlyDatesVisible:true,historicalNoCarry:true,themeGroupsPreserved:true,expandedSignals:12,noOverflow:true});await context.close();console.log(`${width} ${scheme}: AI ETF and all expanded signal states passed`);
 }
 await writeFile(out+'/results.json',JSON.stringify({results},null,2));
}finally{await browser.close();}
