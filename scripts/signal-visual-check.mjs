import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {launch,openPage,layout,bubbles,out,base} from "./signal-check-utils.mjs";
const browser=await launch(),report=[];
try {
  for(const width of [1440,390]){
    const {page,context,initial,errors}=await openPage(browser,width);
    assert.equal(page.url(),base.replace(/\/$/,"")+"/");
    assert.match(await page.title(),/每日市场信号/);
    assert.equal(await page.locator("rect[data-date]").count(),730);
    assert.equal(await page.locator(".market-period").count(),1);
    assert.equal(await page.locator(".trend-range-control").count(),1);
    assert.equal(await page.locator(".chart-legend").count(),1);
    await layout(page,width+" initial");
    const alignment=await page.evaluate(()=>{
      const a=[...document.querySelectorAll('[data-calendar-market=CN] rect[data-date]')];
      const b=[...document.querySelectorAll('[data-calendar-market=US] rect[data-date]')];
      return a.every((cell,i)=>cell.dataset.date===b[i].dataset.date && Math.abs(cell.getBoundingClientRect().x-b[i].getBoundingClientRect().x)<1);
    });
    assert.ok(alignment,"calendar dates and columns align");
    const axes=await page.locator(".trend-chart").evaluateAll(els=>els.map(el=>[el.dataset.start,el.dataset.end]));
    assert.deepEqual(axes[0],axes[1],"both markets share date axis");
    const center=await page.locator(".search-wrap").evaluate(el=>{const r=el.getBoundingClientRect();return r.x+r.width/2-innerWidth/2;});
    assert.ok(Math.abs(center)<1,"search remains centered");
    await page.screenshot({path:`${out}/${width}-full.png`,fullPage:true});
    await page.screenshot({path:`${out}/${width}-viewport.png`});
    for (const days of [30,90,180,365]) {
      await page.getByRole("button",{name:`${days} 日`,exact:true}).click();
      assert.equal(await page.getByRole("button",{name:`${days} 日`,exact:true}).getAttribute("aria-pressed"),"true");
      for(const span of await page.locator(".trend-chart").evaluateAll(els=>els.map(el=>(Date.parse(el.dataset.end)-Date.parse(el.dataset.start))/86400000)))assert.equal(span,days-1);
    }
    await page.getByRole("button",{name:"30 日",exact:true}).click();
    assert.equal(await page.locator(".technical-signals .meter-labels, .technical-signals .range-ends, .technical-signals .signal-status").count(),0);
    assert.doesNotMatch(await page.locator(".technical-signals").first().innerText(),/0–100|超卖|超买|中性/);
    // A dated singleton is a point, never a made-up historical line.
    if(initial.markets.US.snapshot.sentiment?.observations.length===1)assert.equal(await page.locator('[data-analysis-market=US] [data-series=sentiment]').count(),0);
    for(const market of ["CN","US"]){
      for(const id of ["rsi","trend","volume","range"]){
        const s=initial.markets[market].snapshot, value=s.history[s.asOf].values[id];
        const marker=page.locator(`[data-analysis-market=${market}] [data-signal=${id}] .meter-marker`);
        assert.equal(await marker.count(),value===null?0:1);
      }
    }
    const hoverShift=await page.evaluate(async()=>{
      const target=document.querySelector(".market-signals"),top=target.getBoundingClientRect().top+scrollY;
      let max=0;
      for(const cell of document.querySelectorAll(".calendar-section rect[data-date]")){
        cell.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
        await new Promise(resolve=>requestAnimationFrame(resolve));
        max=Math.max(max,Math.abs(target.getBoundingClientRect().top+scrollY-top));
        cell.dispatchEvent(new MouseEvent("mouseout",{bubbles:true}));
      }
      return max;
    });
    assert.equal(hoverShift,0,"calendar previews never move content");
    await bubbles(page,width,"current");
    await page.locator(".signal-trigger").first().focus();await page.locator(".signal-tooltip").waitFor();
    await page.keyboard.press("Escape");await page.locator(".signal-tooltip").waitFor({state:"hidden"});
    assert.deepEqual(errors,[]);
    report.push({width,identity:true,cells:730,alignedCalendars:true,sharedAxes:true,sharedRange:true,tooltips:10,singletonHistory:true,missingMarkers:true,maxHoverShift:hoverShift,consoleErrors:errors});
    await context.close();
  }
  await writeFile(`${out}/results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
