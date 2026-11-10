// Read-only browser acceptance against a local or already-published review URL.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {launch,base,out} from './signal-check-utils.mjs';
const browser=await launch(),results=[];
try{
 for(const width of [1440,390])for(const scheme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce',isMobile:width===390,hasTouch:width===390});
  const page=await context.newPage(),errors=[],valuationRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/valuations/US'))valuationRequests.push(r.url());});
  await page.goto(base+'?market=US',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const panel=()=>page.locator('[data-panel="us-valuations"]');await panel().locator('table[aria-busy="false"]').waitFor();
  const capture=async (name, expanded=false)=>{
   if(!expanded)await page.mouse.move(0,0);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('[data-panel="us-valuations"],.valuation-groups,.valuation-groups button,[data-panel="us-valuations"] th,[data-panel="us-valuations"] td,.valuation-tooltip,.overview-detail')].filter(e=>e.checkVisibility()).flatMap(e=>{const r=e.getBoundingClientRect();return r.left< -1||r.right>innerWidth+1||e.scrollWidth>e.clientWidth+1?[e.className]:[];})}));
   assert.deepEqual(check,{overflow:false,clipped:[]},name);if(expanded){assert.equal(await page.locator('.overview-detail').count(),1);await page.locator('.overview-detail').screenshot({path:`${out}/${width}-${scheme}-${name}-detail.png`});}await page.screenshot({path:`${out}/${width}-${scheme}-${name}-full.png`,fullPage:true});
   if(await panel().count())await panel().screenshot({path:`${out}/${width}-${scheme}-${name}-panel.png`});
  };
  const expected=['半导体','存储','光连接','数据中心','AI 电力基建','云计算','云软件','网络安全','机器人'];
  assert.deepEqual(await panel().locator('tbody th strong').allTextContents(),expected);
  assert.deepEqual(await panel().locator('.valuation-groups button').allTextContents(),['AI 板块','传统行业','宽基']);
  assert(!/XLK|XLC|XLI|XLU|细分主题/.test(await panel().innerText()));
  await capture('ai-subthemes-default');
  for(const label of ['传统行业','宽基','AI 板块','AI 板块']){await panel().getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(200);await capture('group-'+label);}
  assert.deepEqual(await panel().locator('tbody th strong').allTextContents(),expected);
  const toggle=panel().locator('.panel-heading h2 button');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await capture('reopened');
  for(const date of ['2026-11-06','2026-11-05','2026-11-06']){
   const cell=page.locator(`rect[role="button"][data-date="${date}"]`);await cell.focus();await cell.press('Enter');
   await panel().locator(`table[data-valuation-date="${date}"][aria-busy="false"]`).waitFor();
   assert.deepEqual(await panel().locator('tbody th strong').allTextContents(),expected);
   if(date==='2026-11-06'){assert.deepEqual(await panel().locator('tbody tr').first().locator('td b').allTextContents(),['86.9%','—']);assert.equal(await panel().locator('tbody tr').first().locator('td small').first().innerText(),'13.40倍');}
   else assert.equal(await panel().locator('.valuation-track i').count(),0);
   await capture('historical-'+date);
  }
  assert(valuationRequests.length>0);assert(valuationRequests.every(u=>new URL(u).pathname==='/api/valuations/US/themes'));
  for(const market of ['US','CN']){
   const slider=page.getByRole('slider',{name:'切换市场',exact:true});await slider.focus();await slider.press(market==='US'?'End':'Home');await page.locator(`main[data-market="${market}"]`).waitFor();await page.locator('.six-factor-trigger').first().waitFor();
   for(const axis of market==='US'?['fearGreed','priceStrength','breadth','putCall','vix','creditSpread']:['fearGreed','rsi','breadth','limitRatio','turnover','relativeTurnover']){const trigger=page.locator(`.six-factor-trigger[data-radar-axis="${axis}"]`);await trigger.evaluate(e=>e.scrollIntoView({block:'center'}));await trigger.click();await page.locator('.overview-detail').waitFor();await page.waitForFunction(()=>{const e=document.querySelector('.overview-detail');if(!e)return false;const r=e.getBoundingClientRect();return e.scrollHeight<=e.clientHeight+1&&r.top>=0&&r.bottom<=innerHeight;});await capture(market+'-'+axis,true);await page.keyboard.press('Escape');await page.mouse.move(0,0);assert.equal(await page.locator('.overview-detail').count(),0);}
  }
  assert.deepEqual(errors,[]);results.push({width,scheme,aiSubthemesOnly:true,retiredETFRequests:0,exactDateGaps:true,themeGroupsPreserved:true,expandedSignals:12,noOverflow:true});await context.close();console.log(`${width} ${scheme}: AI subthemes and all expanded signal states passed`);
 }
 await writeFile(out+'/results.json',JSON.stringify({results},null,2));
}finally{await browser.close();}
