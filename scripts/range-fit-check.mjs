import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import{launch,openPage,layout,out}from'./signal-check-utils.mjs';
const browser=await launch(),report=[],day=(d,n)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10),distance=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
const state=p=>p.locator('.trend-range-control').evaluate(e=>({start:e.dataset.start,end:e.dataset.end,min:e.dataset.min,max:e.dataset.max,count:Number(e.dataset.dayCount)}));
async function fitted(p,n){
 const v=await state(p);assert.equal(v.count,n);assert.equal(distance(v.start,v.end),n);
 for(const m of['CN','US']){
  const grid=p.locator('[data-calendar-market='+m+'] .calendar-section');assert.equal(await grid.locator('rect[data-date]').count(),n);
  assert.equal(await grid.getAttribute('data-start'),v.start);assert.equal(await grid.getAttribute('data-end'),v.end);assert.equal(await p.locator('[data-analysis-market='+m+'] .trend-chart').getAttribute('data-range'),String(n));
  const info=await grid.evaluate(e=>{const r=e.getBoundingClientRect(),rects=[...e.querySelectorAll('rect[data-date]')].map(el=>el.getBoundingClientRect());return{w:r.width,scroll:e.scrollWidth,left:r.left,right:r.right,positions:rects.map(r=>({x:r.left,right:r.right,y:r.top,h:r.height})),overflow:getComputedStyle(e.querySelector('.calendar-groups')).overflowX};});
  assert.equal(info.scroll,info.w);assert.equal(info.overflow,'clip');assert.ok(info.positions.every(r=>r.x>=info.left-1&&r.right<=info.right+1&&Math.abs(r.h-20)<.1),'calendar clipped or flattened');
  assert.equal(new Set(info.positions.map(r=>Math.round(r.y))).size,7);
  await grid.locator('.calendar-groups').evaluate(e=>{e.scrollLeft=200;});assert.equal(await grid.locator('.calendar-groups').evaluate(e=>e.scrollLeft),0);
 }
 assert.equal(await p.locator('.navigator-caption time').count(),2);assert.doesNotMatch(await p.locator('.navigator-caption').innerText(),/已选|自然日/);
 await layout(p,'fitted '+n);return v;
}
try{for(const width of[1440,1165,390,320]){
 const {page,context,errors,initial}=await openPage(browser,width),defaults=width<=760?90:365;await fitted(page,defaults);
 await page.screenshot({path:out+'/'+width+'-fit-default.png',fullPage:true});
 const geometry=await page.locator('.calendar-groups').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top+scrollY,height:e.clientHeight})));
 const v=await state(page);
 for(const n of[30,90,180,365,604,730]){
  if(n<=365)await page.getByRole('button',{name:n+' 日',exact:true}).click();
  else {const saved={start:day(v.max,1-n),end:v.max};assert.ok(saved.start>=v.min);await page.evaluate(s=>sessionStorage.setItem('trendbeak:window:v1',JSON.stringify(s)),saved);await page.reload({waitUntil:'networkidle'});await page.locator('main[data-range-ready=true]').waitFor();}
  await fitted(page,n);assert.deepEqual(await page.locator('.calendar-groups').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top+scrollY,height:e.clientHeight}))),geometry);
  await page.screenshot({path:out+'/'+width+'-fit-'+n+'.png',fullPage:true});
  if(n===604||n===730){const current=await state(page);assert.match(await page.getByRole('slider',{name:'移动趋势区间',exact:true}).getAttribute('aria-valuetext'),new RegExp(n+'日'));await page.setViewportSize({width:width===1440?390:1440,height:900});await fitted(page,n);assert.deepEqual(await state(page),current);await page.setViewportSize({width,height:900});await fitted(page,n);}
 }
 // A valid observed date remains selectable in the dense 730-day grid.
 const window=await state(page),snapshot=initial.markets.CN.snapshot,date=Object.keys(snapshot.history).filter(d=>d>=window.start&&d<=window.end).sort().at(-150);
 const cell=page.locator('[data-calendar-market=CN] rect[data-date="'+date+'"]');await cell.click();assert.equal(await page.locator('.global-selected-date').getAttribute('datetime'),date);assert.deepEqual(await state(page),window);
 const box=await cell.boundingBox(),shell=page.locator('[data-calendar-market=CN] .calendar-grid-shell'),outer=await shell.boundingBox();
 // Selecting within a visual gap uses the closest date, instead of requiring a tiny rectangle hit.
 await page.mouse.click(box.x+box.width+.05,box.y+box.height/2);assert.equal(await page.locator('.global-selected-date').getAttribute('datetime'),date);
 await cell.focus();await page.keyboard.press('ArrowLeft');assert.notEqual(await page.locator('.global-selected-date').getAttribute('datetime'),date);assert.deepEqual(await state(page),window);
 await page.getByRole('button',{name:'365 日',exact:true}).click();await fitted(page,365);
 assert.equal(await page.locator('.navigator-start').evaluate(e=>getComputedStyle(e).cursor),'ew-resize');assert.equal(await page.locator('.navigator-finish').evaluate(e=>getComputedStyle(e).cursor),'ew-resize');
 const move=page.getByRole('slider',{name:'移动趋势区间',exact:true});assert.equal(await move.evaluate(e=>getComputedStyle(e).cursor),'grab');
 await move.scrollIntoViewIfNeeded();const b=await move.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+20);await page.mouse.down();assert.equal(await move.evaluate(e=>getComputedStyle(e).cursor),'grabbing');await page.mouse.up();
 assert.equal(await page.locator('.navigator-track').evaluate(e=>getComputedStyle(e).userSelect),'none');assert.equal(await page.locator('.trend-range-control title,.trend-range-control [title]').count(),0);
 assert.deepEqual(errors,[]);report.push({width,defaults,sharedInclusiveCounts:true,testedRanges:[30,90,180,365,604,730],oldSavedWindowRestoresExactly:true,resizePreserves:true,noHorizontalScroll:true,allDatesVisible:true,sevenReadableRows:true,nearestDateHit:true,keyboard:true,controlCursors:true,noNativeTooltip:true,errors});await context.close();
}
await writeFile(out+'/range-fit-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}

