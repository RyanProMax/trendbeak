import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launch,openPage,layout,factorBubble,clearPopup,radarUncovered,out} from './signal-check-utils.mjs';
const browser=await launch(),report=[];
const state=p=>p.locator('.trend-range-control').evaluate(e=>({start:e.dataset.start,end:e.dataset.end}));
const calendarGeometry=p=>p.locator('.calendar-groups').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top+scrollY,height:e.getBoundingClientRect().height})));
try {
 for(const width of [1440,1165,390,320]){
  const {page,context,errors}=await openPage(browser,width);
  assert.equal(await page.locator('.annual-calendar title,.annual-calendar [title],.market-signals title,.market-signals [title]').count(),0);
  const cursors=await page.locator('.calendar-section,.calendar-section *, .market-signals,.market-signals *').evaluateAll(es=>[...new Set(es.map(e=>getComputedStyle(e).cursor))]);
  assert.deepEqual(cursors,['default']);
  const original=await calendarGeometry(page),selected=await page.locator('.global-selected-date').getAttribute('datetime');
  for(const n of[365,30,90,180,365]){
   await page.getByRole('button',{name:n+' 日',exact:true}).click();
   assert.deepEqual(await calendarGeometry(page),original);
   for(const market of['CN','US']){
    const grid=page.locator('[data-calendar-market='+market+'] .calendar-section');
    assert.equal(await grid.locator('.react-activity-calendar').count(),1);
    assert.equal(await grid.locator('rect[data-date]').count(),n);
    const rows=await grid.locator('rect[data-date]').evaluateAll(es=>[...new Set(es.map(e=>e.getAttribute('y')))]);
    assert.equal(rows.length,7);
    const smallest=await grid.locator('rect[data-date]').evaluateAll(es=>Math.min(...es.map(e=>Number(e.getAttribute('width')))));
    assert.ok(smallest>=12);
   }
  }
  if(width<=390){
   const scroll=page.locator('[data-calendar-market=CN] .calendar-groups');await scroll.scrollIntoViewIfNeeded();
   const b=await scroll.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+60);await page.mouse.wheel(520,0);
   await page.waitForFunction(()=>document.querySelector('[data-calendar-market=CN] .calendar-groups').scrollLeft>100);
   await page.waitForFunction(()=>Math.abs(document.querySelector('[data-calendar-market=CN] .calendar-groups').scrollLeft-document.querySelector('[data-calendar-market=US] .calendar-groups').scrollLeft)<2);
   assert.equal(await page.locator('.global-selected-date').getAttribute('datetime'),selected);await layout(page,'horizontal grid');
   await page.screenshot({path:out+'/'+width+'-calendar-scroll.png',fullPage:true});
   await page.getByRole('button',{name:'90 日',exact:true}).click();
  }
  const positions=[];
  for(const market of['CN','US']){
   const panel=page.locator('[data-analysis-market='+market+'] .radar-signals');
   for(const factor of['rsi','trend','range','change']){
    await clearPopup(page);await panel.evaluate(e=>e.scrollIntoView({block:'center'}));
    const hit=panel.locator('[data-radar-hit='+factor+']'),axis=panel.locator('[data-radar-axis='+factor+']');
    const before=await panel.locator('.radar-stage').evaluate(e=>({y:e.getBoundingClientRect().y+scrollY,h:e.clientHeight}));
    if(width<=390)await hit.tap();else await hit.hover();
    const bubble=await factorBubble(page,axis);await bubble.waitFor({state:'visible'});
    assert.equal(await bubble.getAttribute('data-radar-factor'),factor);
    assert.equal(await axis.getAttribute('aria-expanded'),'true');
    assert.equal(await panel.locator('[data-radar-point='+factor+'] .radar-point').getAttribute('r'),'7');
    assert.equal(await panel.locator('[data-radar-point='+factor+'] .radar-halo').getAttribute('r'),'12');
    assert.deepEqual(await panel.locator('.radar-stage').evaluate(e=>({y:e.getBoundingClientRect().y+scrollY,h:e.clientHeight})),before);
    await radarUncovered(panel,bubble);await layout(page,'point '+market+factor);
    const rect=await bubble.boundingBox();positions.push({market,factor,x:Math.round(rect.x),y:Math.round(rect.y)});
    await page.screenshot({path:out+'/'+width+'-point-'+market+'-'+factor+'.png',fullPage:true});
    await bubble.screenshot({path:out+'/'+width+'-point-tip-'+market+'-'+factor+'.png'});
    if(width>390){await page.mouse.move(0,0);await bubble.waitFor({state:'hidden'});await axis.hover();await bubble.waitFor({state:'visible'});assert.equal(await panel.locator('[data-radar-point='+factor+'] .radar-point').getAttribute('r'),'7');}
    await page.keyboard.press('Escape');await bubble.waitFor({state:'hidden'});
   }
  }
  for(const market of['CN','US'])assert.ok(new Set(positions.filter(x=>x.market===market).map(x=>x.x+','+x.y)).size>=2,'bubble remains fixed');
  // Keyboard reaches the actual data points too, with a visible focus ring.
  await page.keyboard.press('Tab');const keyPoint=page.locator('[data-analysis-market=CN] [data-radar-hit=rsi]');await keyPoint.focus();
  const keyBubble=await factorBubble(page,keyPoint);await keyBubble.waitFor({state:'visible'});assert.equal(await keyPoint.evaluate(e=>e.matches(':focus-visible')),true);await page.keyboard.press('Escape');await keyBubble.waitFor({state:'hidden'});
  const trend=page.locator('[data-analysis-market=CN] .trend-wrap'),hit=trend.locator('.chart-hit-area');
  await trend.scrollIntoViewIfNeeded();const b=await hit.boundingBox();await page.mouse.move(b.x+b.width*.52,b.y+b.height*.5);
  const read=trend.locator('.chart-readout');await read.waitFor();assert.equal(await read.locator('time').count(),0);assert.doesNotMatch(await read.innerText(),/\d+年|\d+月|\d+日/);assert.equal(await trend.locator('.chart-active-date').count(),1);
  await trend.screenshot({path:out+'/'+width+'-trend-reading.png'});await page.keyboard.press('Escape');await page.mouse.move(0,0);
  // A cross-year pan must keep the same calendar nodes, heights, scroll and pointer capture.
  await page.getByRole('button',{name:'365 日',exact:true}).click();const range=page.locator('.trend-range-control');await range.scrollIntoViewIfNeeded();
  const move=page.getByRole('slider',{name:'移动趋势区间',exact:true});await move.focus();await page.keyboard.press('Home');
  const old=await state(page),grip=page.locator('.navigator-pan-grip'),g=await grip.boundingBox();
  await page.evaluate(()=>{window.__rangeNode=document.querySelector('.navigator-window');window.__capture=[];window.__rangeNode.addEventListener('gotpointercapture',()=>window.__capture.push('got'));window.__rangeNode.addEventListener('lostpointercapture',()=>window.__capture.push('lost'));});
  const geometry=await calendarGeometry(page),scrollY=await page.evaluate(()=>window.scrollY);
  await page.mouse.move(g.x+g.width/2,g.y+8);await page.mouse.down();
  for(let i=1;i<=12;i++){await page.mouse.move(g.x+g.width/2+Math.min(100,width/4)*i/12,g.y+8);assert.deepEqual(await calendarGeometry(page),geometry);assert.equal(await page.evaluate(()=>window.scrollY),scrollY);}
  await page.mouse.up();assert.notDeepEqual(await state(page),old);
  assert.deepEqual(await page.evaluate(()=>({same:window.__rangeNode===document.querySelector('.navigator-window'),connected:window.__rangeNode.isConnected,capture:window.__capture})),{same:true,connected:true,capture:['got','lost']});
  assert.equal(await page.locator('.global-selected-date').getAttribute('datetime'),selected);await layout(page,'final');
  await page.screenshot({path:out+'/'+width+'-hover-final.png',fullPage:true});assert.deepEqual(errors,[]);
  report.push({width,nativeTitlesAbsent:true,defaultCursor:true,actualPointHoverOrTap:true,labelSharesHighlight:true,allEightFactors:true,dynamicPositions:positions,diagramAndValuesUncovered:true,keyboardFocus:true,noDuplicateTrendDate:true,continuousSevenRows:true,calendarHeightAndScrollStable:true,dragCapturePreserved:true,sharedHorizontalScroll:width<=390,noErrors:true});
  await context.close();
 }
 await writeFile(out+'/chart-hover-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}

