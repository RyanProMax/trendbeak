import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
export const base = process.env.SIGNAL_PREVIEW_URL || "http://127.0.0.1:8788";
export const out = process.env.SIGNAL_ARTIFACT_DIR || "artifacts/screenshots/signals";
export async function launch() {
  await mkdir(out,{recursive:true});
  return chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : ["darwin","win32"].includes(process.platform) ? {channel:"chrome"} : {});
}
export async function openPage(browser,width) {
  const context = await browser.newContext({viewport:{width,height:900},isMobile:width<=390,hasTouch:width<=390,reducedMotion:"reduce"});
  const page=await context.newPage(), errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error" && /hydration|React error|Uncaught/i.test(m.text()))errors.push(m.text());});
  await page.goto(base,{waitUntil:"networkidle"});
  await page.locator(".signal-trigger").nth(7).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const initial=await page.evaluate(()=>JSON.parse(document.querySelector("#trendbeak-data").textContent));
  return {page,context,initial,errors};
}
export async function layout(page,label) {
  const result=await page.evaluate(()=>{
    const width=document.documentElement.clientWidth;
    return {width,scroll:document.documentElement.scrollWidth,invalid:[...document.querySelectorAll(".market-card,.calendar-section,.calendar-section svg,.market-analysis,.signal-trigger,.signal-tooltip,.search-popover,.trend-chart,.chart-tooltip,.trend-range-control,.navigator-track")].flatMap(el=>{
      const r=el.getBoundingClientRect(),clipped=el instanceof HTMLElement && el.scrollWidth>el.clientWidth+1;
      return r.left < -1 || r.right > width+1 || clipped ? [{tag:el.className,left:r.left,right:r.right,clipped}] : [];
    })};
  });
  assert.equal(result.scroll,result.width,label+": page overflow");
  assert.deepEqual(result.invalid,[],label+": component overflow");
}
export async function bubbles(page,width,prefix) {
  const triggers=page.locator(".signal-trigger");
  for(let i=0;i<await triggers.count();i++){
    const trigger=triggers.nth(i);await trigger.scrollIntoViewIfNeeded();
    const before=await trigger.boundingBox();
    if(width===390)await trigger.tap();else await trigger.hover();
    const bubble=page.locator(".signal-tooltip");await bubble.waitFor();
    await layout(page,prefix+" bubble "+i);
    const box=await bubble.boundingBox();assert.ok(box.y>=0 && box.y+box.height<=900,prefix+": tooltip vertical overflow");
    assert.equal((await trigger.boundingBox()).y,before.y,prefix+": tooltip moves content");
    await page.screenshot({path:`${out}/${width}-${prefix}-signal-${i}.png`,fullPage:true});
    await bubble.screenshot({path:`${out}/${width}-${prefix}-bubble-${i}.png`});
    await page.keyboard.press("Escape");await page.mouse.move(0,0);
    await bubble.waitFor({state:"hidden"});
  }
}

export async function selectLatestCalendarDate(page,initial) {
 const [market,snapshot]=Object.entries(initial.markets).map(([market,state])=>[market,state.snapshot]).filter(([,snapshot])=>snapshot).sort((a,b)=>a[1].asOf.localeCompare(b[1].asOf)).at(-1);
 await page.locator(`[data-calendar-market=${market}] rect[data-date="${snapshot.asOf}"]`).click();
 return snapshot.asOf;
}
