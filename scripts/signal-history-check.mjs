import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {launch,openPage,layout,bubbles,out} from "./signal-check-utils.mjs";
const browser=await launch(),report=[];
try{
 for(const width of [1440,390]){
  const {page,context,initial,errors}=await openPage(browser,width);
  const cn=initial.markets.CN.snapshot,us=initial.markets.US.snapshot;
  const date=Object.keys(cn.history).filter(d=>us.history[d]).sort().at(-40);
  const calendar=page.locator('[data-calendar-market=CN]');
  await calendar.locator(`button[data-date="${date}"]`).click();
  for(const market of ["CN","US"]){
    const snapshot=initial.markets[market].snapshot;
    const analysis=page.locator(`[data-analysis-market=${market}]`);
    assert.equal(await analysis.locator(".signals").getAttribute("data-date"),date);
    assert.equal(await page.locator(`[data-market=${market}] .quote`).innerText(),snapshot.history[date].price.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
    for(const [id,value] of Object.entries(snapshot.history[date].values)){
      const meter=analysis.locator(`[data-signal=${id}] [role=meter]`);
      if(value===null)assert.equal(await meter.getAttribute("aria-valuenow"),null);
      else{const min=Number(await meter.getAttribute("aria-valuemin")),max=Number(await meter.getAttribute("aria-valuemax"));assert.equal(Number(await meter.getAttribute("aria-valuenow")),Math.max(min,Math.min(max,value)));}
    }
    const closed=snapshot.days.find(d=>d.status==="closed" && d.date>=date);
    const cell=page.locator(`[data-calendar-market=${market}] button[data-date="${closed.date}"]`);
    assert.equal(await cell.getAttribute("aria-disabled"),"true");
    await cell.dispatchEvent("click");for(const key of ["Enter"," ","ArrowLeft"])await cell.dispatchEvent("keydown",{key});
    assert.equal(await analysis.locator(".signals").getAttribute("data-date"),date);
    await cell.hover();await page.getByRole("tooltip").filter({hasText:"休市"}).first().waitFor();
    await layout(page,"closed hover");await page.screenshot({path:`${out}/${width}-closed-${market}.png`,fullPage:true});
    await page.mouse.move(0,0);
    const holiday=snapshot.days.find(d=>d.status==="closed" && ![0,6].includes(new Date(d.date+"T12:00:00Z").getUTCDay()));
    assert.ok(holiday);
    await page.locator(`[data-calendar-market=${market}] button[data-date="${holiday.date}"]`).dispatchEvent("click");
    assert.equal(await analysis.locator(".signals").getAttribute("data-date"),date);
  }
  assert.equal(await page.locator('[data-analysis-market=US] [data-series=sentiment]').count(),0);
  await page.screenshot({path:`${out}/${width}-historical.png`,fullPage:true});
  await bubbles(page,width,"historical");
  // Missing market-specific sessions display no invented reading when the other market trades.
  const divergent=cn.days.find(d=>d.status==="trading" && us.days.find(u=>u.date===d.date)?.status==="closed");
  if(divergent){await calendar.locator(`button[data-date="${divergent.date}"]`).click();assert.equal(await page.locator('[data-market=US] .quote').innerText(),"—");assert.match(await page.locator(".session-dates").innerText(),/美股.*休市/);}
  await calendar.locator(`button[data-date="${date}"]`).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const keyboardDate=await page.locator('[data-analysis-market=CN] .signals').getAttribute("data-date");
  assert.notEqual(cn.days.find(d=>d.date===keyboardDate)?.status,"closed");
  await page.getByRole("button",{name:"返回最新日期"}).click();
  for(const market of ["CN","US"])assert.equal(await page.locator(`[data-analysis-market=${market}] .signals`).getAttribute("data-date"),initial.markets[market].snapshot.asOf);
  await page.getByLabel("选择日历日期").fill(date);
  assert.equal(await page.locator('[data-analysis-market=CN] .signals').getAttribute("data-date"),date);
  await page.getByRole("button",{name:"后一个交易日期"}).click();
  assert.notEqual(await page.locator('[data-analysis-market=CN] .signals').getAttribute("data-date"),date);
  await layout(page,"history complete");assert.deepEqual(errors,[]);
  report.push({width,linkedHistory:true,correctValues:true,closedDatesDisabled:true,holidays:true,keyboard:true,dateInput:true,latest:true,historicalTooltips:10,noInventedUSHistory:true,consoleErrors:errors});await context.close();
 }
 await writeFile(`${out}/history-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
