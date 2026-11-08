import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.SIGNAL_PREVIEW_URL??'http://127.0.0.1:8798';
const out=process.env.SIGNAL_ARTIFACT_DIR??'artifacts/screenshots/client-refresh-policy';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
try{
 const context=await browser.newContext(),page=await context.newPage(),requests=[];
 page.on('request',request=>{if(/\/api\/markets\/(CN|US)(?:\?|$)/.test(request.url()))requests.push(request.url());});
 await page.goto(base,{waitUntil:'networkidle'});
 await page.locator('button.six-factor-trigger').first().waitFor();
 assert.ok(requests.some(url=>url.includes('/api/markets/CN')),'initial CN request remains');
 assert.equal(await page.locator('.quote-refresh').count(),0,'healthy quotes have no refresh control');
 await page.getByRole('slider',{name:'切换市场',exact:true}).press('End');
 await page.locator('.market-analysis[data-analysis-market="US"] button.six-factor-trigger').first().waitFor();
 assert.ok(requests.some(url=>url.includes('/api/markets/US')),'first US visit still loads its data');
 const initialRequests=[...requests];
 await page.clock.install();
 await page.clock.fastForward(11*60*1000);
 await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
 await page.waitForTimeout(500);
 assert.deepEqual(requests,initialRequests,'elapsed time and visibility/focus must not refresh loaded quotes');
 assert.equal(await page.locator('.quote-refresh').count(),0);
 await writeFile(out+'/results.json',JSON.stringify({initialRequests,noPeriodicRefresh:true,noHealthyRefreshButton:true},null,2));
 console.log(JSON.stringify({passed:true,initialRequests:initialRequests.length,noPeriodicRefresh:true}));
 await context.close();
}finally{await browser.close();}
