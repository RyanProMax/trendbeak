import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.SIGNAL_PREVIEW_URL??'http://127.0.0.1:8812';
const out=process.env.SIGNAL_ARTIFACT_DIR??'artifacts/theme-transition';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-features=OverlayScrollbar']});
const results=[];
async function frame(page,path){
 const png=await page.screenshot({path});
 return page.evaluate(async data=>{
  const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data].slice(0,3);
  return {width:image.width,height:image.height,samples:[1,image.width-1].flatMap(x=>[140,300,500,700,850].map(y=>({x,y,rgb:pixel(x,y)})))};
 },png.toString('base64'));
}
try{
 for(const width of [1440,390])for(const initial of ['dark','light']){
  const page=await browser.newPage({viewport:{width,height:900},colorScheme:initial}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('.six-factor-trigger').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const geometry=()=>page.evaluate(()=>({width:document.documentElement.clientWidth,x:document.body.getBoundingClientRect().x,main:document.querySelector('main').getBoundingClientRect().width}));
  const before=await geometry();assert.ok(before.x>0,'classic two-sided gutter must be present');
  await page.evaluate(()=>{const original=Element.prototype.animate;Element.prototype.animate=function(keyframes,options){const animation=original.call(this,keyframes,options);if(options?.pseudoElement){window.themeAnimation=animation;animation.pause();animation.currentTime=0;}return animation;};});
  await page.locator('.theme-switch').click();await page.waitForFunction(()=>window.themeAnimation);
  const next=initial==='dark'?'light':'dark';
  for(const progress of [.05,.25,.5,.75,.95]){
   const clip=await page.evaluate(async progress=>{const a=window.themeAnimation;a.currentTime=400*progress;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return getComputedStyle(document.documentElement,a.effect.pseudoElement).clipPath;},progress);
   const [r,x,y]=clip.match(/[\d.]+/g).map(Number);
   const shot=await frame(page,`${out}/${width}-${initial}-${progress}.png`);
   for(const p of shot.samples){const distance=Math.hypot(p.x-x,p.y-y);if(Math.abs(distance-r)<3)continue;const expected=distance<r?255:0;assert.ok(p.rgb.every(v=>Math.abs(v-expected)<3),JSON.stringify({width,initial,progress,clip,p,expected}));}
   assert.deepEqual(await geometry(),before,'transition must not shift layout');
   results.push({width,initial,progress,clip,samples:shot.samples});
  }
  await page.evaluate(()=>window.themeAnimation.finish());await page.waitForTimeout(100);
  assert.equal(await page.locator('html').getAttribute('data-theme'),next);
  assert.deepEqual(await geometry(),before);
  await page.screenshot({path:`${out}/${width}-${next}-full.png`,fullPage:true});
  // Every expanded factor remains readable with the unchanged layout.
  for(const trigger of await page.locator('.six-factor-trigger').all()){
   await trigger.click();await page.locator('.overview-detail').waitFor();
   assert.equal(await page.locator('.overview-detail').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   await page.locator('.overview-detail').screenshot({path:`${out}/${width}-${next}-detail-${await trigger.getAttribute('data-radar-axis')}.png`});
   await page.screenshot({path:`${out}/${width}-${next}-expanded-${await trigger.getAttribute('data-radar-axis')}.png`});
   await page.keyboard.press('Escape');
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.theme-switch').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),initial);
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.pseudoElement).length),0);
  assert.deepEqual(await geometry(),before);
  await page.reload({waitUntil:'networkidle'});await page.locator('.six-factor-trigger').first().waitFor();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('.theme-switch').focus();await page.keyboard.press('Enter');await page.waitForTimeout(60);
  for(let i=0;i<3;i++){await page.locator('.theme-switch').evaluate(e=>e.click());await page.waitForTimeout(60);}
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.pseudoElement).length),0,'interrupted transitions clean up');
  assert.equal(await page.locator('html').getAttribute('data-theme'),initial);
  assert.deepEqual(await geometry(),before);
  await page.emulateMedia({forcedColors:'active'});await page.locator('.theme-switch').click();await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarColor),'auto');
  await page.screenshot({path:`${out}/${width}-${initial}-forced.png`,fullPage:true});
  await page.emulateMedia({forcedColors:'none',reducedMotion:'reduce'});
  const longGeometry=await geometry();
  await page.addStyleTag({content:'body{height:0!important;min-height:0!important;overflow:hidden!important}'});
  assert.deepEqual(await geometry(),longGeometry,'short pages keep the reserved width');
  await page.evaluate(()=>{document.startViewTransition=undefined;});await page.locator('.theme-switch').evaluate(e=>e.click());
  assert.equal(await page.locator('html').getAttribute('data-theme'),initial);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({frames:results.length,widths:[1440,390],directions:2,classicGutters:true,pixelChecks:true,stableLayout:true,reducedMotion:true}));
}finally{await browser.close();}
