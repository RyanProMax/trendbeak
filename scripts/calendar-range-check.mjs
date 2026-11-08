// Run against the local fixture preview after a client build.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base=process.env.REVIEW_BASE_URL??'http://127.0.0.1:8793';
const out=process.env.REVIEW_OUTPUT??'artifacts/range-qa';
const market=process.env.REVIEW_MARKET??'CN';
async function activateMarket(page) {
 if(market==='US')await page.getByRole('slider',{name:'切换市场',exact:true}).press('End');
 await page.locator(`main[data-market="${market}"] .trend-range-control`).waitFor();
}
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),results=[];
try {
 for(const width of [1440,390])for(const scheme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:scheme,reducedMotion:'reduce'}),page=await context.newPage();
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('.trend-range-control').waitFor();await activateMarket(page);
  const end=await page.locator('.trend-range-control').getAttribute('data-max');
  for(const days of [7,30,90,200,365]) {
   const start=new Date(Date.parse(end)+(1-days)*86400000).toISOString().slice(0,10);
   await page.evaluate(({start,end,market})=>sessionStorage.setItem('trendbeak:window:v2:'+market,JSON.stringify({start,end})),{start,end,market});
   await page.reload({waitUntil:'networkidle'});await activateMarket(page);await page.locator(`.calendar-section[data-day-count="${days}"]`).waitFor();
   const geometry=await page.evaluate(()=>{
    const root=document.querySelector('.calendar-section'),shell=root.querySelector('.calendar-grid-shell'),bounds=shell.getBoundingClientRect(),groups=root.querySelector('.calendar-groups').getBoundingClientRect();
    const clipped=[],nonsquare=[];
    for(const e of root.querySelectorAll('rect[data-date]')) {
     const r=e.getBoundingClientRect(),scale=Number(getComputedStyle(root).getPropertyValue('--calendar-scale')),stroke=parseFloat(getComputedStyle(e).strokeWidth)*scale/2;
     if(Math.abs(r.width-r.height)>.1)nonsquare.push(e.dataset.date);
     for(let ancestor=e.parentElement;ancestor&&ancestor!==root;ancestor=ancestor.parentElement) {
      const s=getComputedStyle(ancestor);if(!/(hidden|clip|auto|scroll)/.test(s.overflow))continue;
      const a=ancestor.getBoundingClientRect();if(r.left-stroke<a.left-.1||r.right+stroke>a.right+.1||r.top-stroke<a.top-.1||r.bottom+stroke>a.bottom+.1)clipped.push({date:e.dataset.date,ancestor:ancestor.className.baseVal??ancestor.className});
     }
    }
    const friday=[...root.querySelectorAll('.calendar-weekdays span')].at(-1).getBoundingClientRect();
    const frame=getComputedStyle(document.querySelector('.navigator-track'),'::before');
    return {clipped,nonsquare,fridayBottomGap:groups.bottom-friday.bottom,frameWidth:frame.borderTopWidth,frameColor:frame.borderTopColor,frameInset:frame.left,scroll:document.documentElement.scrollWidth,viewport:innerWidth,gridHeight:bounds.height};
   });
   assert.deepEqual(geometry.clipped,[],JSON.stringify({width,scheme,days,geometry}));assert.deepEqual(geometry.nonsquare,[]);assert.ok(geometry.fridayBottomGap>=2);assert.equal(geometry.frameWidth,'1px');assert.ok(geometry.scroll<=width);
   await page.screenshot({path:`${out}/${width}-${scheme}-${days}-full.png`,fullPage:true});
   await page.locator('.annual-calendar').screenshot({path:`${out}/${width}-${scheme}-${days}-calendar.png`});
   await page.locator('.trend-range-control').screenshot({path:`${out}/${width}-${scheme}-${days}-navigator.png`});
   results.push({market,width,scheme,days,...geometry});
  }
  const startHandle=page.getByRole('slider',{name:'趋势起始日期',exact:true});await startHandle.press('End');assert.equal(await page.locator('.trend-range-control').getAttribute('data-day-count'),'7');
  await startHandle.press('ArrowLeft');assert.equal(await page.locator('.trend-range-control').getAttribute('data-day-count'),'8');
  const move=page.getByRole('slider',{name:'移动趋势区间',exact:true});await move.press('Home');assert.equal(await page.locator('.trend-range-control').getAttribute('data-start'),await page.locator('.trend-range-control').getAttribute('data-min'));
  const track=page.locator('.navigator-track');await track.scrollIntoViewIfNeeded();
  let box=await track.boundingBox();
  await page.mouse.click(box.x+box.width*.65,box.y+box.height/2);
  const jumped=await page.locator('.trend-range-control').getAttribute('data-start');
  assert.notEqual(jumped,await page.locator('.trend-range-control').getAttribute('data-min'));
  assert.equal(await page.locator('.trend-range-control').getAttribute('data-day-count'),'8');
  const handle=await startHandle.boundingBox();
  await page.mouse.move(handle.x+handle.width-1,handle.y+22);await page.mouse.down();await page.mouse.move(handle.x+handle.width-31,handle.y+22,{steps:5});await page.mouse.up();
  assert.ok(Number(await page.locator('.trend-range-control').getAttribute('data-day-count'))>8,'Handle drag grows the window');
  const beforePan=await page.locator('.trend-range-control').getAttribute('data-start'),panDays=await page.locator('.trend-range-control').getAttribute('data-day-count');
  const grip=await page.locator('.navigator-pan-grip').boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2-20,grip.y+grip.height/2,{steps:5});await page.mouse.up();
  assert.notEqual(await page.locator('.trend-range-control').getAttribute('data-start'),beforePan);assert.equal(await page.locator('.trend-range-control').getAttribute('data-day-count'),panDays);
  await context.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(`Passed ${results.length} range/theme/viewport clipping and frame checks, plus keyboard boundaries, track jumps, handle drag and whole-window pan.`);
}finally{await browser.close()}
