import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';

// Opt-in against the locally built preview, alongside the full-page visual suite.
// TREND_PANEL_URL=http://127.0.0.1:8803 node --test tests/panel-fold-browser.test.mjs
const base = process.env.TREND_PANEL_URL;
test('folds reverse smoothly, preserve chart width and focus, and reserve root scrollbar space', {skip: !base}, async () => {
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
 const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}
  : process.platform==='darwin'?{channel:'chrome'}:{});
 try {
  for (const width of [1440,390]) for (const query of ['?market=CN','?market=US','?market=US&symbol=NVDA']) {
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'no-preference'});
   await page.goto(new URL(query,base).href,{waitUntil:'networkidle'});
   await page.locator('main[data-range-ready=true]').waitFor();
   const panels=page.locator('.foldable-panel');
   const count=await panels.count();
   assert.ok(count>0);
   for(let i=0;i<count;i++) {
    const panel=panels.nth(i),body=panel.locator(':scope > .panel-body'),button=panel.locator(':scope > .panel-heading h2 button');
    const measure=()=>body.evaluate(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width,childWidth:e.firstElementChild.getBoundingClientRect().width}));
    await button.scrollIntoViewIfNeeded();
    const initial=await measure();
    await body.evaluate(e=>{e.dataset.testMount='preserved'});
    // Trigger directly to sample the animation before Playwright's stability wait.
    await button.evaluate(e=>e.click());
    assert.equal(await body.getAttribute('inert'),'');
    assert.equal(await body.getAttribute('aria-hidden'),'true');
    assert.equal(await button.evaluate(e=>document.activeElement===e),true);
    await page.waitForTimeout(70);
    const middle=await measure();
    assert.ok(middle.height>0&&middle.height<initial.height,`${width}: intermediate fold height`);
    await button.evaluate(e=>e.click());
    const reversed=await measure();
    assert.ok(Math.abs(reversed.height-middle.height)<initial.height*.3,`${width}: reversal starts at current height`);
    await page.waitForTimeout(300);
    assert.ok(Math.abs((await measure()).height-initial.height)<1);
    const detail=panel.locator('.six-factor-trigger').first();
    if(await detail.count())await detail.click();
    await button.evaluate(e=>e.click());
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.overview-detail,.radar-explanation').count(),0,'fold closes active detail portals');
    const collapsed=await measure();
    assert.ok(collapsed.height<1);
    assert.equal(collapsed.childWidth,initial.childWidth,'mounted chart container retains measured width');
    assert.equal(await body.getAttribute('data-test-mount'),'preserved');
    assert.equal(await body.locator(':scope > .panel-body-content').evaluate(e=>getComputedStyle(e).visibility),'hidden');
    await button.evaluate(e=>e.click());
    await page.waitForTimeout(300);
    assert.equal(await body.locator(':scope > .panel-body-content').evaluate(e=>getComputedStyle(e).overflow),'visible','expanded outlines and details are not clipped');
   }
   // Short/long page root geometry must match, including classic scrollbars.
   const geometry=()=>page.evaluate(()=>({root:document.documentElement.clientWidth,body:document.body.getBoundingClientRect().width,x:document.body.getBoundingClientRect().x}));
   const before=await geometry();
   await page.addStyleTag({content:'body{height:0!important;overflow:hidden!important;min-height:0!important}'});
   assert.deepEqual(await geometry(),before);
   await page.reload({waitUntil:'networkidle'});
   await page.emulateMedia({reducedMotion:'reduce'});
   const first=page.locator('.foldable-panel').first(),body=first.locator(':scope > .panel-body'),button=first.locator('h2 button');
   await button.evaluate(e=>e.click());
   assert.equal(await body.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
   assert.ok((await body.boundingBox()).height<1,'reduced motion collapses instantly');
   await button.evaluate(e=>e.click());
   assert.ok((await body.boundingBox()).height>0,'reduced motion opens instantly');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.close();
  }
 } finally {await browser.close();}
});
