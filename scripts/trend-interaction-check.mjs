import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { launch, openPage, layout, out, selectLatestCalendarDate } from "./signal-check-utils.mjs";
const browser = await launch(), report = [];
const shift = (date, days) => new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
const graphState = page => page.locator('.trend-chart').evaluateAll(charts => charts.map(chart => ({
  start:chart.dataset.start,end:chart.dataset.end,min:chart.dataset.priceMin,max:chart.dataset.priceMax,
  paths:[...chart.querySelectorAll('.trend-series path')].map(path=>path.getAttribute('d')),
})));
async function swipe(page, from, to) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
try {
 for(const width of [1440,390]) {
  const {page,context,initial,errors}=await openPage(browser,width);
  const cn=initial.markets.CN.snapshot,us=initial.markets.US.snapshot;
  const chart=page.locator('[data-analysis-market=CN] .trend-chart'), hit=chart.locator('.chart-hit-area');
  assert.equal(await chart.getAttribute("data-range"), "365", "default range is a full year");
  await page.getByRole("button",{name:"30 日",exact:true}).click();
  const baseline=await graphState(page),end=baseline[0].end,start=baseline[0].start;
  const common=Object.keys(cn.history).filter(date=>us.history[date] && date>=start && date<end).sort().at(-3);
  assert.ok(common);
  await page.evaluate(()=>{
    window.__seriesNodes=[...document.querySelectorAll('.trend-series')];window.__seriesMutations=0;
    window.__seriesObserver=new MutationObserver(records=>window.__seriesMutations+=records.length);
    window.__seriesNodes.forEach(node=>window.__seriesObserver.observe(node,{attributes:true,childList:true,subtree:true}));
  });
  await page.locator(`[data-calendar-market=CN] rect[data-date="${common}"]`).click();
  await page.mouse.move(0,0);
  assert.deepEqual(await graphState(page),baseline,'calendar selection leaves paths and domains unchanged');
  assert.equal(await chart.getAttribute('data-active-date'),common);
  const old=Object.keys(cn.history).filter(date=>us.history[date] && date<start).sort().at(-20);
  await page.locator(`[data-calendar-market=CN] rect[data-date="${old}"]`).click();await page.mouse.move(0,0);
  assert.deepEqual(await graphState(page),baseline);
  assert.equal(await chart.getAttribute('data-active-date'),'');
  assert.match(await page.locator('[data-analysis-market=CN] .trend-status').innerText(),/不在当前 30 日窗口/);
  await hit.scrollIntoViewIfNeeded();
  const box=await hit.boundingBox();
  const position=date=>({x:box.x+(Date.parse(date)-Date.parse(start))/86400000/29*box.width,y:box.y+65});
  if(width===390)await page.touchscreen.tap(position(common).x,position(common).y);else await page.mouse.move(position(common).x,position(common).y);
  const tooltip=page.locator('.chart-tooltip');await tooltip.waitFor();
  assert.equal(await chart.getAttribute('data-active-date'),common);
  assert.match(await tooltip.innerText(),new RegExp(cn.history[common].price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal(await page.locator(`rect[data-date="${common}"][data-trend-hover]`).count(),2);
  const hoverMutations=await page.evaluate(()=>({count:window.__seriesMutations,same:[...document.querySelectorAll('.trend-series')].every((node,index)=>node===window.__seriesNodes[index])}));
  assert.deepEqual(hoverMutations,{count:0,same:true},'hover and selection preserve rendered curve nodes');
  await layout(page,'trend tooltip');
  await tooltip.screenshot({path:`${out}/${width}-trend-tooltip.png`});
  await page.screenshot({path:`${out}/${width}-trend-hover.png`,fullPage:true});
  if(width!==390)await page.mouse.click(position(common).x,position(common).y);
  assert.equal(await page.locator('[data-analysis-market=CN] .signals').getAttribute('data-date'),common);
  assert.equal(await page.locator(`[data-calendar-market=CN] rect[data-date="${common}"]`).getAttribute('aria-pressed'),'true');
  assert.deepEqual(await graphState(page),baseline);
  await page.keyboard.press('Escape');await page.mouse.move(0,0);
  // Keyboard supports every natural date, including a missing/weekend reading, without substituting another session.
  await hit.focus();await page.keyboard.press('Home');
  assert.equal(await chart.getAttribute('data-active-date'),start);
  await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');
  const keyboardDate=shift(end,-1);assert.equal(await chart.getAttribute('data-active-date'),keyboardDate);
  await page.keyboard.press('Enter');
  if(cn.days.some(day=>day.date===keyboardDate&&day.status!=='closed')||us.days.some(day=>day.date===keyboardDate&&day.status!=='closed'))assert.equal(await page.locator('[data-analysis-market=CN] .signals').getAttribute('data-date'),keyboardDate);
  await page.keyboard.press('Escape');await hit.blur();
  const weekend=cn.days.find(day=>day.date>=start&&day.date<end&&day.status==='closed'&&us.days.some(other=>other.date===day.date&&other.status==='closed'));
  if(width===1440&&weekend){await page.mouse.move(position(weekend.date).x,position(weekend.date).y);await tooltip.waitFor();assert.match(await tooltip.innerText(),/休市/);assert.match(await tooltip.innerText(),/无观测/);assert.equal(await chart.locator('.index-active,.emotion-active').count(),0);await page.mouse.move(0,0);}
  await page.evaluate(()=>window.__seriesObserver.disconnect());
  for(const label of ['趋势起始日期','趋势结束日期','移动趋势区间'])assert.equal(await page.getByRole('slider',{name:label,exact:true}).count(),1);
  for(const days of [30,90,180,365]){await page.getByRole('button',{name:`${days} 日`,exact:true}).click();for(const state of await graphState(page))assert.equal((Date.parse(state.end)-Date.parse(state.start))/86400000,days-1);}
  if(us.sentiment?.observations.length===1)assert.equal(await page.locator('[data-analysis-market=US] [data-series=sentiment]').count(),0);
  await page.screenshot({path:`${out}/${width}-trend-365.png`,fullPage:true});
  await page.getByRole('button',{name:'情绪',exact:true}).click();
  assert.equal(await page.locator('.emotion-line,.emotion-end,.emotion-active').count(),0);
  await page.getByRole('button',{name:'大盘',exact:true}).click();assert.equal(await page.locator('.index-line,.index-end,.index-active').count(),0);
  await page.getByRole('button',{name:'情绪',exact:true}).click();await page.getByRole('button',{name:'大盘',exact:true}).click();
  assert.equal(await page.locator('.trend-series').first().evaluate(node=>getComputedStyle(node).animationName),'none');
  assert.equal(await page.locator('.navigator-window').evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
  await page.getByRole('button',{name:'30 日',exact:true}).click();await selectLatestCalendarDate(page,initial);
  await layout(page,'interaction complete');assert.deepEqual(errors,[]);
  report.push({width,selectionKeepsWindow:true,exactTooltip:true,calendarLinked:true,stableCurveNodes:true,outsideWindow:true,keyboard:true,continuousRangeControls:true,touch:width===390,missingUSHistoryNotConnected:true,reducedMotion:true,errors});
  await context.close();
 }
 // Motion is enabled only for range changes, never pointer inspection.
 const {page,context}=await openPage(browser,1440);await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByRole('button',{name:'90 日',exact:true}).click();
 assert.equal(await page.locator('.trend-view').first().evaluate(node=>getComputedStyle(node).transitionProperty),'transform');
 assert.notEqual(await page.locator('.trend-view').first().evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
 await context.close();
 await writeFile(`${out}/interaction-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally { await browser.close(); }
