import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.SIGNAL_PREVIEW_URL??'http://127.0.0.1:8804';
const out=process.env.SIGNAL_ARTIFACT_DIR??'artifacts/session-chart-qa';
await mkdir(out,{recursive:true});
const dates=['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18'];
const fixtures={};
for(const market of ['CN','US','US-NVDA']){
 const body=JSON.parse(await readFile(`artifacts/qa/${market}.json`,'utf8')),snapshot=body.data;
 // Browser-only width/missing-value cases. Never send these observations to a writer.
 dates.forEach((date,i)=>{
  if(i===4)delete snapshot.history[date];
  else snapshot.history[date]={...snapshot.history[date],price:[9.5,999999.99,100.01,10000][i],change:[9.99,-101.12,0,101.12][i]};
  const day=snapshot.days.find(day=>day.date===date);
  if(day){day.status=i===4?'missing':'trading';day.change=snapshot.history[date]?.change??null;}
  if(snapshot.sentiment){
   snapshot.sentiment.observations=snapshot.sentiment.observations.filter(point=>point.date!==date);
   snapshot.sentiment.reportedObservations=snapshot.sentiment.reportedObservations?.filter(point=>point.date!==date);
   if(i<4)snapshot.sentiment.observations.push({date,value:[0,100,9.1,50][i],previous:null});
  }
 });
 snapshot.sentiment?.observations.sort((a,b)=>a.date.localeCompare(b.date));
 fixtures[market]=body;
}
const browser=await chromium.launch({channel:'chrome'}),results=[];
try{
 for(const scheme of (process.env.READOUT_SCHEMES?.split(',')??['light','dark']))for(const width of (process.env.READOUT_WIDTHS?.split(',').map(Number)??[1440,390,320])){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/markets/*',route=>{
   const url=new URL(route.request().url()),symbol=url.searchParams.get('symbol');
   return route.fulfill({json:fixtures[symbol==='NVDA'?'US-NVDA':url.pathname.endsWith('/US')?'US':'CN']});
  });
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('rect[data-date="2026-11-03"]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const marketSlider=page.getByRole('slider',{name:'切换市场',exact:true});
  const switchMarket=async market=>{await marketSlider.focus();await marketSlider.press(market==='CN'?'Home':'End');await page.locator(`main[data-market="${market}"]`).waitFor();};
  const range=async()=>{
   const start=page.getByRole('slider',{name:'趋势起始日期',exact:true}),end=page.getByRole('slider',{name:'趋势结束日期',exact:true});
   await start.focus();await start.press('Home');await end.focus();await end.press('End');
  };
  const select=async date=>{const cell=page.locator(`rect[role="button"][data-date="${date}"]`);await cell.focus();await cell.press('Enter');};
  const hit=()=>page.locator('.chart-hit-area');
  // Number/return widths may change naturally. Only the outer groups, labels,
  // emotion slot and heading must remain fixed as the inspected date changes.
  const boxes=()=>page.locator('.signals-heading,.chart-readout,.readout-item,.readout-label,.readout-price-group,.readout-emotion .readout-value').evaluateAll(els=>els.map(e=>{
   const b=e.getBoundingClientRect();return{class:e.className,x:b.x,y:b.y+scrollY,width:b.width,height:b.height};
  }));
  const compare=(a,b,label)=>assert.deepEqual(a,b,label);
  const layout=async label=>{
   const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,items:[...document.querySelectorAll('.chart-readout,.readout-price-group,.readout-price-number,.readout-change,.readout-unit,.readout-emotion')].map(e=>{
    const b=e.getBoundingClientRect();return{class:e.className,left:b.left,right:b.right,scroll:e.scrollWidth,client:e.clientWidth};
   })}));
   assert.equal(result.overflow,false,label);
   for(const item of result.items){
    assert.ok(item.left>=0&&item.right<=width,JSON.stringify({label,item,width}));
    assert.ok(item.scroll<=item.client+1,JSON.stringify({label,item,width}));
   }
   return result;
  };
  const textGaps=()=>page.locator('.chart-readout').evaluate(readout=>{
   const textBox=element=>{
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];let node;
    while(node=walker.nextNode())if(node.textContent.trim())nodes.push(node);
    if(!nodes.length)return null;
    const first=nodes[0],last=nodes.at(-1),range=document.createRange();
    range.setStart(first,first.textContent.search(/\S/));range.setEnd(last,last.textContent.trimEnd().length);
    const box=range.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom};
   };
   const price=readout.querySelector('.readout-price'),label=textBox(price.querySelector('.readout-label')),number=textBox(price.querySelector('.readout-price-number'));
   const change=textBox(price.querySelector('.readout-change')),unit=price.querySelector('.readout-unit'),mood=readout.querySelector('.readout-emotion');
   const moodLabel=mood&&textBox(mood.querySelector('.readout-label')),moodValue=mood&&textBox(mood.querySelector('.readout-value'));
   const sameLine=label.top<number.bottom&&number.top<label.bottom;
   return{labelGap:sameLine?number.left-label.right:null,moodGap:mood?moodValue.left-moodLabel.right:null,expectedGap:parseFloat(getComputedStyle(price).columnGap),returnGap:change?change.left-(unit?textBox(unit).right:number.right):null,hasUnit:!!unit};
  });
  const checkGaps=async label=>{
   const gaps=await textGaps();
   if(!gaps.hasUnit)assert.notEqual(gaps.labelGap,null,`${label}: index label and value wrapped apart`);
   if(gaps.labelGap!==null)assert.ok(Math.abs(gaps.labelGap-gaps.expectedGap)<.2,`${label}: label gap ${JSON.stringify(gaps)}`);
   if(gaps.labelGap!==null&&gaps.moodGap!==null)assert.ok(Math.abs(gaps.labelGap-gaps.moodGap)<.2,`${label}: price/emotion gaps differ`);
   if(gaps.returnGap!==null)assert.ok(gaps.returnGap>=0&&gaps.returnGap<(gaps.hasUnit?12:9),`${label}: quote and return separated ${JSON.stringify(gaps)}`);
   return gaps;
  };
  const scrubWidths=async market=>{
   await select(dates[0]);await hit().focus();await hit().press('Home');
   // Keyboard session navigation reaches the browser-only missing price as well.
   await select(dates[0]);await hit().focus();const stable=await boxes(),samples=[];
   for(let i=0;i<dates.length;i++){
    if(i)await hit().press('ArrowRight');
    assert.equal(await page.locator('.trend-chart').getAttribute('data-active-date'),dates[i]);
    compare(stable,await boxes(),`${width}px ${scheme} ${market} heading/readout moved at ${dates[i]}`);
    assert.equal(await page.locator('.readout-price-number').innerText(),['9.50','999,999.99','100.01','10,000.00','—'][i]);
    if(i===4)assert.equal(await page.locator('.readout-change').textContent(),'\u00a0');
    await layout(`${market} width fixture ${dates[i]}`);samples.push({date:dates[i],...await checkGaps(`${market} ${dates[i]}`)});
   }
   // A continuous pointer drag must preserve the same outer positions too.
   const area=await hit().boundingBox(),last=Number(await hit().getAttribute('aria-valuemax')),index=Number(await hit().getAttribute('aria-valuenow'));
   const y=area.y+area.height/2,x=i=>area.x+i/last*area.width;
   await page.mouse.move(x(index-4),y);await page.mouse.down();
   for(let i=index-3;i<=index;i++){
    await page.mouse.move(x(i),y);compare(stable,await boxes(),`${market} pointer drag moved outer readout`);await checkGaps(`${market} drag`);
   }
   await page.mouse.up();
   await page.screenshot({path:`${out}/${width}-${scheme}-${market}-missing.png`,fullPage:true});
   return samples;
  };
  await range();await select('2026-07-02');await hit().focus();await hit().press('ArrowRight');
  assert.equal(await page.locator('.trend-chart').getAttribute('data-active-date'),'2026-07-03');
  const beforeRange=await page.locator('.trend-range-control').getAttribute('data-start');
  await select('2026-07-24');const cnBefore=await boxes();await select('2026-07-27');const cnGap=await boxes();compare(cnBefore,cnGap);
  assert.equal(await page.locator('.readout-emotion .readout-value').innerText(),'—');
  assert.equal(await page.locator('.trend-range-control').getAttribute('data-start'),beforeRange);
  await layout('CN gap');const cnSpacing=await checkGaps('CN real quote');await page.screenshot({path:`${out}/${width}-${scheme}-CN.png`,fullPage:true});
  const cnWidths=await scrubWidths('CN');
  await switchMarket('US');await range();await select('2026-07-02');await hit().focus();await hit().press('ArrowRight');
  assert.equal(await page.locator('.trend-chart').getAttribute('data-active-date'),'2026-07-06');
  // Hit-testing at the current session coordinate lands on exactly that session.
  const box=await hit().boundingBox(),index=Number(await hit().getAttribute('aria-valuenow')),last=Number(await hit().getAttribute('aria-valuemax'));
  await page.mouse.move(box.x+index/last*box.width,box.y+box.height/2);assert.equal(await page.locator('.trend-chart').getAttribute('data-active-date'),'2026-07-06');
  await page.mouse.move(1,1);await select('2026-07-02');const usBefore=await boxes();await select('2026-11-03');compare(usBefore,await boxes());
  await layout('US different returns');const usSpacing=await checkGaps('US real quote');await page.screenshot({path:`${out}/${width}-${scheme}-US.png`,fullPage:true});
  const usWidths=await scrubWidths('US');
  const start=page.getByRole('slider',{name:'趋势起始日期',exact:true});
  const old=await page.locator('.trend-range-control').evaluate(e=>({start:e.dataset.start,end:e.dataset.end,count:+e.dataset.dayCount}));
  await start.focus();await start.press('ArrowRight');
  const next=await page.locator('.trend-range-control').evaluate(e=>({start:e.dataset.start,end:e.dataset.end,count:+e.dataset.dayCount}));
  assert.equal(Date.parse(next.start)-Date.parse(old.start),86400000);assert.equal(next.end,old.end);assert.equal(next.count,old.count-1);
  const search=page.getByRole('combobox',{name:'搜索股票'});await search.fill('NVDA');await page.getByRole('option').filter({hasText:'NVDA'}).click();
  await page.locator('.stock-signals').waitFor();await range();await select('2026-07-02');const stockBefore=await boxes();
  assert.equal(await page.locator('.readout-unit').textContent(),' USD');await select('2026-11-03');compare(stockBefore,await boxes());
  await layout('NVDA variable prices');const stockSpacing=await checkGaps('NVDA real quote');await page.screenshot({path:`${out}/${width}-${scheme}-NVDA.png`,fullPage:true});
  const stockWidths=await scrubWidths('NVDA');assert.deepEqual(errors,[]);
  results.push({scheme,width,calendarMapping:true,pointerMapping:true,naturalRange:true,fixedOuterGroups:true,compactInnerText:true,cnGapBlank:true,noOverflow:true,cnSpacing,usSpacing,stockSpacing,cnWidths,usWidths,stockWidths,errors});
  console.log(JSON.stringify({scheme,width,passed:true}));await context.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
}finally{await browser.close();}
