/** Local, read-only UI audit using prepared observations. No data writes. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.SIGNAL_PREVIEW_URL??'http://127.0.0.1:8806',out=process.env.SIGNAL_ARTIFACT_DIR??'artifacts/qa/percentile-colors';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),results=[];
const palette={light:['#336b50','#566a40','#766330','#965137','#a9443b'],dark:['#79b699','#a8bd85','#c8bd83','#d8ab83','#e59b89']};
const rgb=hex=>{if(hex.length===4)hex='#'+[...hex.slice(1)].map(c=>c+c).join('');return `rgb(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')})`;};
const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
async function readColors(page){return page.evaluate(()=>{
 const style=(e,p)=>getComputedStyle(e)[p];
 return{theme:document.documentElement.dataset.theme,date:document.querySelector('main').dataset.selectedDate,background:style(document.body,'backgroundColor'),muted:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
 readings:[...document.querySelectorAll('.six-factor-trigger,.valuation-trigger')].map(e=>{const n=e.querySelector('b'),rank=e.querySelector('.six-factor-percentile-label>span:last-child'),track=e.querySelector('.six-factor-track,.valuation-track'),fill=track?.firstElementChild;return{key:e.dataset.radarAxis??e.closest('tr').querySelector('th small').textContent,stage:e.dataset.percentileStage,text:style(n,'color'),rank:rank?style(rank,'color'):null,raw:n.textContent,fill:fill?style(fill,'backgroundColor'):null,track:track?style(track,'backgroundColor'):null,width:fill?.style.width};}),
 points:[...document.querySelectorAll('.six-factor-point')].map(e=>({key:e.dataset.factor,stage:e.dataset.percentileStage,fill:style(e,'fill')})),edges:[...document.querySelectorAll('.six-factor-edge path')].map(e=>({stage:e.dataset.percentileStage,stroke:style(e,'stroke')})),
 polygon:document.querySelectorAll('.six-factor-area').length,headerDates:document.querySelectorAll('[data-panel=sentiment] > .panel-heading time,[data-panel=valuations] > .panel-heading time').length,overflow:document.documentElement.scrollWidth>innerWidth};
});}
async function check(page,scheme,label){
 const state=await readColors(page);assert.equal(state.overflow,false,label);assert.equal(state.headerDates,0,label);
 for(const r of state.readings){const expected=r.stage==='missing'?rgb(state.muted):rgb(palette[scheme][Number(r.stage)]);assert.equal(r.text,expected,`${label} ${r.key} text`);if(r.rank)assert.equal(r.rank,expected,`${label} ${r.key} percentile`);assert.ok(contrast(r.text,state.background)>=4.5,`${label} ${r.key} text contrast`);if(r.fill){assert.equal(r.fill,expected,`${label} ${r.key} fill`);assert.ok(contrast(r.fill,r.track)>=3,`${label} ${r.key} track contrast`);}}
 for(const p of state.points)assert.equal(p.fill,rgb(palette[scheme][p.stage]),`${label} ${p.key} point`);
 for(const e of state.edges)assert.equal(e.stroke,rgb(palette[scheme][e.stage]),`${label} edge`);
 results.push({label,...state});
 await page.mouse.move(0,0);await page.screenshot({path:`${out}/${label}.png`,fullPage:true,animations:'disabled'});
 return state;
}
async function selectDate(page,date){const cell=page.locator(`rect[data-date="${date}"][role="button"]`);await cell.scrollIntoViewIfNeeded();await cell.focus();await cell.press('Enter');await page.keyboard.press('Escape');await page.waitForFunction(d=>document.querySelector('main').dataset.selectedDate===d,date);await page.waitForTimeout(250);}
try{
 for(const width of [1440,390])for(const scheme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('.valuation-trigger').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const initial=await check(page,scheme,`${width}-${scheme}-CN-current`);
  assert.ok(new Set(initial.readings.filter(r=>r.stage!=='missing').map(r=>r.text)).size>=3);
  await selectDate(page,'2026-10-29');await page.waitForFunction(()=>!document.querySelector('.valuation-status').textContent.includes('正在'));await check(page,scheme,`${width}-${scheme}-CN-history`);
  const slider=page.getByRole('slider',{name:'切换市场',exact:true});await slider.focus();await slider.press('End');await page.locator('main[data-market="US"]').waitFor();await page.locator('[data-radar-axis="vix"]').waitFor();
  const us=await check(page,scheme,`${width}-${scheme}-US-current`);
  assert.equal(us.points.length,6);assert.equal(us.edges.length,12);
  await page.getByRole('slider',{name:'趋势起始日期',exact:true}).focus();await page.keyboard.press('Home');await page.getByRole('slider',{name:'趋势结束日期',exact:true}).focus();await page.keyboard.press('End');
  await selectDate(page,'2026-03-12');const missing=await check(page,scheme,`${width}-${scheme}-US-missing`);assert.equal(missing.points.length,0);assert.equal(missing.edges.length,0);assert.equal(missing.polygon,0);assert.ok(missing.readings.every(r=>r.stage==='missing'&&!r.fill));
  await selectDate(page,'2026-11-06');await check(page,scheme,`${width}-${scheme}-US-restored`);
  for(const market of ['US','CN']){
   if(market==='CN'){await slider.focus();await slider.press('Home');await page.locator('main[data-market="CN"]').waitFor();await page.locator('.valuation-trigger').first().waitFor();}
   await page.emulateMedia({forcedColors:'active'});const forced=await readColors(page);
   assert.ok(forced.readings.every(r=>!r.fill||r.fill===r.text));assert.ok(forced.points.every(p=>p.fill===forced.readings.find(r=>r.key===p.key).text));assert.ok(forced.edges.every(e=>e.stroke===forced.points[0].fill));
   results.push({label:`${width}-${scheme}-${market}-forced`,...forced});await page.screenshot({path:`${out}/${width}-${scheme}-${market}-forced.png`,fullPage:true,animations:'disabled'});await page.emulateMedia({forcedColors:'none'});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({audits:results.length,widths:[1440,390],themes:['light','dark'],computedColors:true,missingAndRestore:true,forcedColors:true,errors:0}));
}finally{await browser.close();}
