import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launch,openPage,layout,out,selectLatestCalendarDate} from './signal-check-utils.mjs';
const browser=await launch(),report=[];
try{
 for(const width of [1440,390,320]){
  const {page,context,initial,errors}=await openPage(browser,width);
  assert.equal(await page.locator('.market-grid').count(),0);
  assert.equal(await page.locator('.calendar-row > .market-card').count(),2);
  assert.equal(await page.getByRole('slider',{name:'拖动选择趋势范围'}).getAttribute('aria-valuenow'),'365');
  assert.equal(await page.locator('.calendar-heading button').count(),0);
  assert.equal(await page.locator('.calendar-heading').locator(':scope > *').count(),2);
  const type=await page.evaluate(()=>[...document.querySelectorAll('.trend-chart .chart-tick,.chart-axis-head,.chart-active-date,.index-end,.emotion-end,.chart-legend,.navigator-caption,.navigator-stops button,.heat-legend')].map(el=>({size:parseFloat(getComputedStyle(el).fontSize),scale:el instanceof SVGElement?el.getScreenCTM().a:1})));
  assert.ok(type.every(({size,scale})=>size*scale>=10.9),'chart labels retain at least 11 actual pixels');
  for(const market of ['CN','US']){
   const labels=await page.locator(`[data-analysis-market=${market}] .index-end,[data-analysis-market=${market}] .emotion-end`).evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
   if(labels.length===2)assert.ok(labels[0].bottom<=labels[1].top||labels[1].bottom<=labels[0].top,'right-end values never collide');
  }
  const legend=await page.locator('.heat-legend').evaluate(el=>[...el.children].map(child=>{const r=child.getBoundingClientRect();return {x:r.x,width:r.width,y:r.y};}));
  if(Math.abs(legend[0].y-legend[1].y)<2)assert.ok(legend[1].x-legend[0].x-legend[0].width<=25,'legend groups remain together');
  else for(const item of legend)assert.ok(Math.abs(item.x+item.width/2-width/2)<1,'wrapped legend groups are centered');
  await page.screenshot({path:`${out}/${width}-simplified-full.png`,fullPage:true});
  assert.equal(await page.locator('.calendar-heading').locator('h2').innerText(),'每日涨跌');
  for(const heading of await page.locator('.analysis-heading').allTextContents())assert.ok(/^(A\s?股|美股)$/.test(heading));
  for(const label of await page.locator('.index-end,.emotion-end').all()){
   assert.match(await label.textContent(),/^[\d,.]+$/);
   assert.ok((await label.getAttribute('aria-label')).length>(await label.textContent()).length);
   assert.ok(await label.getAttribute('data-label-date'));
  }
  const date=Object.keys(initial.markets.CN.snapshot.history).filter(d=>initial.markets.US.snapshot.history[d]).sort().at(-40);
  await page.locator(`[data-calendar-market=CN] rect[data-date="${date}"]`).click();await page.mouse.move(0,0);
  assert.equal(await page.locator('.global-selected-date').getAttribute('datetime'),date);
  const usChart=page.locator('[data-analysis-market=US] .trend-chart'),usHit=usChart.locator('.chart-hit-area');
  await usHit.scrollIntoViewIfNeeded();const box=await usHit.boundingBox();
  const start=await usChart.getAttribute('data-start'),fraction=(Date.parse(date)-Date.parse(start))/86400000/364;
  await page.mouse.move(box.x+fraction*box.width,box.y+65);
  await page.locator('.chart-tooltip').waitFor();assert.match(await page.locator('.chart-tooltip').innerText(),/无观测/);
  await page.mouse.move(0,0);
  const gradient=await page.locator('.trend-chart linearGradient[gradientUnits="userSpaceOnUse"]').first().evaluate(el=>({x1:el.getAttribute('x1'),x2:el.getAttribute('x2'),y1:el.getAttribute('y1'),y2:el.getAttribute('y2'),stops:[...el.children].map(stop=>({offset:stop.getAttribute('offset'),color:stop.getAttribute('stop-color')}))}));
  assert.equal(gradient.x1,gradient.x2);assert.notEqual(gradient.y1,gradient.y2);
  assert.deepEqual(gradient.stops.map(stop=>stop.offset),['0%','20%','40%','50%','65%','80%','100%']);
  assert.equal(await page.locator('.index-line').first().evaluate(el=>getComputedStyle(el).strokeDasharray),'none');
  const chart=page.locator('[data-analysis-market=CN] .trend-chart'),hit=chart.locator('.chart-hit-area');
  await hit.scrollIntoViewIfNeeded();await page.mouse.click((await hit.boundingBox()).x+35,(await hit.boundingBox()).y+60);
  assert.equal(await hit.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  assert.equal(Number(await chart.locator('.chart-focus-ring').evaluate(el=>getComputedStyle(el).opacity)),0);
  await page.screenshot({path:`${out}/${width}-pointer-focus.png`,fullPage:true});
  await page.keyboard.press('Tab');await hit.focus();
  assert.equal(await hit.evaluate(el=>el.matches(':focus-visible')),true);
  assert.ok(Number(await chart.locator('.chart-focus-ring').evaluate(el=>getComputedStyle(el).opacity))>.5);
  assert.ok(parseFloat(await chart.locator('.chart-focus-ring').evaluate(el=>getComputedStyle(el).strokeWidth))<=1.5);
  await page.screenshot({path:`${out}/${width}-keyboard-focus.png`,fullPage:true});
  await page.keyboard.press('Escape');await hit.blur();
  await selectLatestCalendarDate(page,initial);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const view=page.locator('.index-view').first();
  const before=await view.evaluate(el=>getComputedStyle(el).transform);
  const originalPaths=await page.locator('.trend-series path').evaluateAll(paths=>paths.map(path=>path.getAttribute('d')));
  await page.getByRole('button',{name:'30 日',exact:true}).click();
  const samples=await page.evaluate(async()=>{
   const view=document.querySelector('.index-view'),start=performance.now(),samples=[];
   return await new Promise(resolve=>{function frame(now){samples.push({ms:now-start,transform:getComputedStyle(view).transform});if(now-start<600)requestAnimationFrame(frame);else resolve(samples);}requestAnimationFrame(frame);});
  });
  const target=await view.evaluate(el=>el.style.transform);
  assert.ok(new Set(samples.map(sample=>sample.transform)).size>4,'range zoom has actual intermediate transforms');
  assert.notEqual(samples.at(-1).transform,before);
  assert.deepEqual(await page.locator('.trend-series path').evaluateAll(paths=>paths.map(path=>path.getAttribute('d'))),originalPaths,'zoom never synthesizes new observation paths');
  assert.equal(await page.locator('.trend-series').first().evaluate(el=>getComputedStyle(el).animationName),'none','not merely an opacity reveal');
  await page.screenshot({path:`${out}/${width}-range-30.png`,fullPage:true});
  await page.getByRole('button',{name:'365 日',exact:true}).click();await page.waitForTimeout(150);
  await page.screenshot({path:`${out}/${width}-range-mid-motion.png`,fullPage:true});await page.waitForTimeout(350);
  const search=page.getByRole('combobox'),field=page.locator('.search-field');
  await page.mouse.move(0,0);await search.scrollIntoViewIfNeeded();
  assert.equal(await field.evaluate(el=>getComputedStyle(el,'::before').animationPlayState),'paused');
  if(width===1440)await field.hover();else await search.focus();await page.waitForTimeout(180);
  const first=await field.evaluate(el=>getComputedStyle(el,'::before').transform);await page.waitForTimeout(180);
  assert.notEqual(await field.evaluate(el=>getComputedStyle(el,'::before').transform),first);
  assert.match(await field.evaluate(el=>getComputedStyle(el,'::before').backgroundImage),/conic-gradient/);
  await search.focus();await page.screenshot({path:`${out}/${width}-search-rainbow.png`});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await field.evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  await search.blur();await page.mouse.move(0,0);
  await page.getByRole('button',{name:'30 日',exact:true}).click();
  assert.equal(await view.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await page.getByRole('button',{name:'365 日',exact:true}).click();
  await layout(page,'rainbow final');assert.deepEqual(errors,[]);
  const intervals=samples.slice(1).map((sample,i)=>sample.ms-samples[i].ms).sort((a,b)=>a-b);
  report.push({width,quotesIntegrated:true,default365:true,numericEndLabelsAccessible:true,headerOnlyTitleAndDate:true,minimumActualChartTextPx:Math.min(...type.map(({size,scale})=>size*scale)),centeredCombinedLegend:true,historicalEmotionNotFilled:true,verticalScoreGradient:gradient,solidBenchmark:true,noMouseBlackOutline:true,keyboardFocusRing:true,stablePathsDuringZoom:true,intermediateTransformCount:new Set(samples.map(sample=>sample.transform)).size,animationFrameMedianMs:intervals[Math.floor(intervals.length/2)],animationFrameP95Ms:intervals[Math.floor(intervals.length*.95)],animationSamples:samples,searchRotatesOnlyActive:true,reducedMotion:true,errors});
  await context.close();
 }
 await writeFile(`${out}/rainbow-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({animationSamples,...result})=>result)));
}finally{await browser.close();}
