import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {launch,openPage,layout,out,base} from "./signal-check-utils.mjs";
const browser=await launch(),report=[];
try{
 for(const width of [1440,390]){
  const {page,context,initial,errors}=await openPage(browser,width);
  const search=page.getByRole("combobox");
  for(const [query,market,name] of [["600519","CN","贵州茅台"],["英伟达","US","英伟达"]]){
    await page.evaluate(()=>scrollTo(0,0));await search.fill(query);
    const option=page.getByRole("option").filter({hasText:name}).first();await option.waitFor();await layout(page,"search "+market);
    await page.screenshot({path:`${out}/${width}-search-${market}.png`,fullPage:true});
    await option.click();await page.locator(`[data-market=${market}].stock-selected`).waitFor();
    await page.waitForFunction(m=>!document.querySelector(`[data-market=${m}]`).hasAttribute("aria-busy"),market);
    assert.equal(await page.locator(".signals").count(),2);
    assert.match(await page.locator(`[data-analysis-market=${market}] .index-end`).getAttribute("aria-label"),market==="CN"?/沪深 300/:/标普 500/);
    await layout(page,"stock selected");
  }
  await page.reload({waitUntil:"networkidle"});await search.click();
  assert.equal(await page.getByRole("option").count(),2);
  await page.getByRole("button",{name:"清空",exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem("trendbeak:search-history:v1")),null);
  const instrument={market:"US",symbol:"TEST",code:"TEST",kind:"stock",name:"A deliberately long company name for responsive layout verification"};
  const quote=structuredClone(initial.markets.US.snapshot);quote.instrument=instrument;
  let failed=false,release;let gate=null;
  await page.route("**/api/search?*",r=>r.fulfill({json:{data:[instrument]}}));
  await page.route("**/api/markets/US?*",async r=>{if(gate)await gate;return failed?r.fulfill({status:503,json:{error:"行情暂不可用"}}):r.fulfill({json:{data:quote}});});
  const original=await page.locator("[data-market=US] .quote").innerText();
  await search.fill("test");await page.getByRole("option").waitFor();await page.keyboard.press("Escape");await page.keyboard.press("Enter");
  assert.equal(await page.locator(".stock-selected").count(),0);
  gate=new Promise(resolve=>release=resolve);
  await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  await page.locator("[data-market=US] .market-loading").waitFor();
  assert.equal(await page.locator("[data-market=US] .quote").innerText(),original);
  assert.equal(await page.locator(".signals").count(),2);release();gate=null;
  await page.locator("[data-market=US] .market-loading").waitFor({state:"hidden"});
  await layout(page,"long name");await page.screenshot({path:`${out}/${width}-long-name.png`,fullPage:true});
  failed=true;await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  await page.locator("[data-market=US] .market-refresh-error").waitFor();assert.equal(await page.locator(".signals").count(),2);
  await page.screenshot({path:`${out}/${width}-refresh-error.png`,fullPage:true});
  await page.locator("[data-market=US] .back-market").click();
  await page.getByRole("button",{name:"重试美股行情"}).waitFor();assert.equal(await page.locator(".signals").count(),2);
  failed=false;quote.instrument=initial.markets.US.instrument;
  await page.getByRole("button",{name:"重试美股行情"}).click();await page.locator("[data-market=US].stock-selected").waitFor({state:"hidden"});
  await page.evaluate(()=>localStorage.setItem("trendbeak:search-history:v1",JSON.stringify(Array.from({length:12},(_,i)=>({market:"US",symbol:`T${i}`,code:`T${i}`,kind:"stock",name:`Test ${i}` })))));
  await page.reload({waitUntil:"networkidle"});await search.click();assert.equal(await page.getByRole("option").count(),10);await layout(page,"history ten");
  await page.screenshot({path:`${out}/${width}-history-ten.png`,fullPage:true});
  await page.goto(base+"/offline",{waitUntil:"networkidle"});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await page.screenshot({path:`${out}/${width}-offline.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  report.push({width,realSearches:2,marketSwitch:true,benchmarkPreserved:true,atomicSwitch:true,longName:true,refreshFailureKeepsData:true,retry:true,recentSearches:10,offline:true,consoleErrors:errors});
  await context.close();
 }
 await writeFile(`${out}/state-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
