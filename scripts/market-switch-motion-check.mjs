import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.SIGNAL_PREVIEW_URL??'http://127.0.0.1:8788';
const out=process.env.SIGNAL_ARTIFACT_DIR??'artifacts/screenshots/market-motion';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),results=[];
const state=page=>page.evaluate(()=>({market:document.querySelector('main').dataset.market,selected:document.querySelector('main').dataset.selectedDate,start:document.querySelector('.trend-range-control')?.dataset.start,end:document.querySelector('.trend-range-control')?.dataset.end,url:location.search,opacity:getComputedStyle(document.querySelector('main')).opacity,transform:getComputedStyle(document.querySelector('main')).transform,animations:document.querySelector('main').getAnimations().map(a=>({state:a.playState,duration:a.effect.getTiming().duration}))}));
async function pointer(page,market){const slider=page.getByRole('slider',{name:'切换市场',exact:true});await slider.scrollIntoViewIfNeeded();const rect=await slider.boundingBox();await page.mouse.click(rect.x+rect.width*(market==='US'?.8:.2),rect.y+rect.height/2);}
async function observeAnimations(context){await context.addInitScript(()=>{
 window.__marketMotion=[];
 const animate=Element.prototype.animate,cancel=Animation.prototype.cancel;
 Element.prototype.animate=function(frames,options){if(this.tagName==='MAIN')window.__marketMotion.push({type:'animate',frames,options});return animate.call(this,frames,options);};
 Animation.prototype.cancel=function(){const target=this.effect?.target;if(target?.tagName==='MAIN'){const style=getComputedStyle(target);window.__marketMotion.push({type:'cancel',running:this.playState==='running',opacity:Number(style.opacity),transform:style.transform});}return cancel.call(this);};
});}
try{
 for(const reducedMotion of['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion});await observeAnimations(context);const page=await context.newPage();
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('button.six-factor-trigger').first().waitFor();const cn=await state(page);
  await pointer(page,'US');const during=await state(page);assert.equal(during.market,'US');assert.match(during.url,/market=US/);assert.equal(during.transform,'none','pointer switch never translates content');
  if(reducedMotion==='reduce'){assert.equal(during.opacity,'1');assert.equal(during.transform,'none');assert.equal(during.animations.length,0);}
  await pointer(page,'CN');await pointer(page,'US');await pointer(page,'CN');await page.waitForTimeout(300);
  const reversed=await state(page);assert.equal(reversed.market,'CN');assert.equal(reversed.selected,cn.selected);assert.equal(reversed.start,cn.start);assert.equal(reversed.end,cn.end);assert.equal(reversed.opacity,'1');
  const events=await page.evaluate(()=>window.__marketMotion);let interruptions=0;
  for(let i=0;i<events.length;i++){const event=events[i];if(event.type==='animate'){assert.ok(event.options.duration<200);assert.ok(event.frames.every(frame=>frame.transform===undefined||frame.transform==='none'),'dashboard only fades, never translates');}if(event.type==='cancel'&&event.running&&events[i+1]?.type==='animate'){const start=events[i+1].frames[0];assert.ok(Math.abs(start.opacity-event.opacity)<.001,'interruption preserves current opacity');assert.equal(event.transform,'none','interruption does not translate dashboard');assert.ok(start.transform===undefined||start.transform==='none','resumed fade does not introduce translation');interruptions++;}}
  if(reducedMotion==='no-preference')assert.ok(interruptions>0,'rapid reversals exercise an in-flight transition');
  await page.getByRole('slider',{name:'切换市场',exact:true}).press('End');const keyboard=await state(page);assert.equal(keyboard.market,'US');assert.equal(keyboard.opacity,'1');assert.ok(!keyboard.animations.some(a=>a.state==='running'));
  const thumb=await page.locator('.market-switch-thumb').evaluate(e=>({transition:getComputedStyle(e).transitionDuration,background:getComputedStyle(e.parentElement).backgroundImage}));assert.equal(thumb.transition,'0s','keyboard thumb is immediate');assert.match(thumb.background,/linear-gradient/);
  results.push({reducedMotion,during,reversed,keyboard,interruptions});await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();let release,seen=false;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/markets/US*',async route=>{seen=true;await gate;await route.continue();});
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('button.six-factor-trigger').first().waitFor();await pointer(page,'US');await pointer(page,'CN');release();await page.waitForTimeout(1200);assert.ok(seen);assert.equal((await state(page)).market,'CN');results.push({pendingOldFetchDoesNotReclaim:true});await context.close();
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({motionCases:2,pendingFetchRace:true,interruptions:results[0].interruptions}));
}finally{await browser.close();}
