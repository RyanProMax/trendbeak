import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launch,openPage,selectRange,layout,out} from './signal-check-utils.mjs';
const browser=await launch(),report=[];
async function point(page,market,date){const chart=page.locator(`[data-analysis-market=${market}] .trend-chart`);await chart.scrollIntoViewIfNeeded();const box=await chart.locator('.chart-hit-area').boundingBox(),start=await chart.getAttribute('data-start'),end=await chart.getAttribute('data-end');return{x:box.x+(Date.parse(date)-Date.parse(start))/(Date.parse(end)-Date.parse(start))*box.width,y:box.y+box.height/2};}
async function selected(page,date){await page.waitForFunction(d=>document.querySelector('.global-selected-date').getAttribute('datetime')===d,date);assert.deepEqual(await page.locator('.signals').evaluateAll(es=>es.map(e=>e.dataset.date)),[date,date]);}
try{for(const width of[1440,1024,390,320]){
 const{page,context,initial,errors}=await openPage(browser,width),latest=initial.markets.US.snapshot.asOf;
 await selectRange(page,365);
 assert.doesNotMatch(await page.locator('body').innerText(),/暂未更新|无观测|当日读数暂缺|同期报道补录/);
 assert.equal(await page.locator('.chart-readout-source,.snapshot-stale').count(),0);
 assert.equal(await page.locator('.search-field').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.equal(await page.getByRole('combobox').evaluate(e=>getComputedStyle(e).cursor),'text');
 assert.equal(await page.locator('.chart-hit-area').first().evaluate(e=>getComputedStyle(e).cursor),'pointer');
 assert.equal(await page.locator('.radar-axis').first().evaluate(e=>getComputedStyle(e).cursor),'pointer');
 assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).caretColor),'rgba(0, 0, 0, 0)');
 for(const market of['CN','US']){
   const grid=page.locator(`[data-calendar-market=${market}] .calendar-grid-shell`);
   assert.equal(await grid.evaluate(e=>getComputedStyle(e).cursor),'pointer');
   const geometry=await grid.evaluate(e=>{const shell=e.getBoundingClientRect();return[...e.querySelectorAll('rect[data-date]')].map(r=>{const b=r.getBoundingClientRect();return{left:b.left-shell.left,right:shell.right-b.right,top:b.top-shell.top,bottom:shell.bottom-b.bottom,square:Math.abs(b.width-b.height)};});});
   assert.ok(geometry.every(g=>Math.min(g.left,g.right,g.top,g.bottom)>=2.4&&g.square<.1),'calendar must reserve actual paint space on every edge');
   await grid.locator(`rect[data-date="${latest}"]`).hover();await grid.screenshot({path:`${out}/${width}-${market}-calendar-edges.png`});
 }
 // A: a visit without a click returns to the latest real date.
 let p=await point(page,'CN','2026-04-15');await page.mouse.move(p.x,p.y);await page.mouse.move(2,2);await selected(page,latest);
 // B: the first exit after a click preserves that selected date in both markets.
 p=await point(page,'CN','2026-04-15');await page.mouse.click(p.x,p.y);await page.mouse.move(2,2);await selected(page,'2026-04-15');
 assert.equal(await page.locator('.chart-readout').count(),2);await page.getByRole('combobox').focus();await selected(page,'2026-04-15');
 for(const label of await page.locator('.readout-label').all()){const gap=await label.evaluate(e=>e.nextElementSibling.getBoundingClientRect().left-e.getBoundingClientRect().right);assert.ok(gap>=5&&gap<=7,'label/value gap must stay compact');}
 await layout(page,'clicked date '+width);await page.screenshot({path:`${out}/${width}-clicked-date-full.png`,fullPage:true});
 // C: re-entering to browse, without clicking again, clears the earlier lock on exit.
 p=await point(page,'US','2026-04-16');await page.mouse.move(p.x,p.y);await page.mouse.move(2,2);await selected(page,latest);
 // The most recent click within the same visit survives further movement and its first exit.
 p=await point(page,'US','2026-04-16');await page.mouse.click(p.x,p.y);const other=await point(page,'US','2026-04-17');await page.mouse.move(other.x,other.y);await page.mouse.move(2,2);await selected(page,'2026-04-16');
 if(width<=390){p=await point(page,'CN','2026-04-15');await page.touchscreen.tap(p.x,p.y);await selected(page,'2026-04-15');const cdp=await context.newCDPSession(page);p=await point(page,'CN','2026-04-16');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y+60,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await selected(page,'2026-04-15');}
 await layout(page,'reader interactions '+width);assert.deepEqual(errors,[]);report.push({width,hoverExitLatest:true,clickFirstExitKeepsDate:true,reentryExitLatest:true,focusKeepsDate:true,compactGroups:true,completeCalendarBorders:true,semanticCursors:true,transparentInput:true,neutralDataState:true,touch:width<=390,errors});await context.close();
}await writeFile(out+'/reader-interactions-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}
