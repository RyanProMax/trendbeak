import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { launch, openPage, layout, selectRange, out } from "./signal-check-utils.mjs";

const browser = await launch(), report = [];
async function point(page, market, date) {
  const chart = page.locator(`[data-analysis-market=${market}] .trend-chart`);
  await chart.scrollIntoViewIfNeeded();
  const area = await chart.locator(".chart-hit-area").boundingBox(), start = await chart.getAttribute("data-start"), end = await chart.getAttribute("data-end");
  return { x: area.x + (Date.parse(date) - Date.parse(start)) / (Date.parse(end) - Date.parse(start)) * area.width, y: area.y + area.height / 2 };
}
async function inspect(page, market, date, touch = false) {
  const p = await point(page, market, date);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...p, id: 0 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else await page.mouse.move(p.x, p.y);
  await page.waitForFunction(({ market, date }) => document.querySelector(`[data-analysis-market=${market}] .trend-chart`).dataset.activeDate === date, { market, date });
  return page.locator(`[data-analysis-market=${market}] .chart-readout`);
}
async function geometry(readout) {
  return readout.evaluate(e => [e, ...e.querySelectorAll(".readout-item,.readout-label,.readout-value,.explanation-close")].map(el => {
    const r = el.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 10) / 10);
  }));
}
try {
  for (const width of [1440, 1024, 390, 320]) {
    const { page, context, initial, errors } = await openPage(browser, width);
    await selectRange(page, 365);
    const us = page.locator("[data-analysis-market=US]");
    assert.ok(Number(await us.locator(".trend-chart").getAttribute("data-emotion-observations")) >= 240, "US history must be a real series, not a current-only point");
    assert.ok(await us.locator(".emotion-line").count());
    const reported = await inspect(page, "US", "2026-03-12", width < 760);
    assert.equal(await reported.locator(".readout-emotion b").innerText(), "21.2");
    assert.equal(await reported.locator(".chart-readout-source").innerText(), "CNN／Benzinga同期报道补录");
    assert.match(await reported.locator(".chart-readout-source").getAttribute("href"), /^https:\/\/www\.benzinga\.com\//);
    await layout(page, width + " dated report");
    await page.screenshot({ path: `${out}/${width}-reported-readout-full.png`, fullPage: true });
    for (const market of ["CN", "US"]) {
      const closed = await inspect(page, market, "2026-07-25", width < 760);
      assert.deepEqual(await closed.locator(".readout-value").allTextContents(), ["休市", "休市"]);
      assert.doesNotMatch(await closed.innerText(), /无观测/);
    }
    assert.deepEqual(await (await inspect(page, "CN", "2026-10-01", width < 760)).locator(".readout-value").allTextContents(), ["休市", "休市"]);
    assert.notEqual(await (await inspect(page, "US", "2026-10-01", width < 760)).locator(".readout-price b").innerText(), "休市");
    assert.deepEqual(await (await inspect(page, "US", "2026-07-03", width < 760)).locator(".readout-value").allTextContents(), ["休市", "休市"]);
    if (width >= 760) { const p = await point(page, "US", "2026-07-03"); await page.mouse.click(p.x, p.y); }
    await page.waitForFunction(() => document.querySelector(".global-selected-date").getAttribute("datetime") === "2026-07-03");
    assert.deepEqual(await us.locator(".radar-value").allTextContents(), ["休市", "休市", "休市", "休市"]);
    for (let i = 0; i < 4; i++) {
      const axis = us.locator(".radar-axis").nth(i); await axis.scrollIntoViewIfNeeded(); await axis.click();
      const bubble = page.locator(`[id="${await axis.getAttribute("aria-controls")}"]`);
      await bubble.waitFor({ state: "visible" }); assert.equal(await bubble.locator(".radar-explanation-title b").innerText(), "休市");
      await layout(page, `${width} closed signal ${i}`);
      await page.screenshot({ path: `${out}/${width}-closed-signal-${i}.png`, fullPage: true });
      await bubble.getByRole("button", { name: "关闭指标说明" }).click(); await page.mouse.move(0, 0);
    }
    await page.screenshot({ path: `${out}/${width}-closed-readout-full.png`, fullPage: true });
    const gap = await inspect(page, "CN", "2026-07-27", width < 760);
    assert.equal(await gap.locator(".readout-emotion b").innerText(), "暂无数据");
    assert.notEqual(await gap.locator(".readout-price b").innerText(), "休市");
    assert.match(await gap.locator(".chart-readout-source").innerText(), /百分位.*当日读数暂缺/);
    await layout(page, `${width} verified source gap`);
    await page.screenshot({ path: `${out}/${width}-open-gap-full.png`, fullPage: true });

    // Browser-only fixtures exercise widths and signs, never written to D1.
    const data = structuredClone(initial.markets), dates = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];
    for (const market of ["CN", "US"]) {
      const s = data[market].snapshot;
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i], price = [9.5, 999999.99, 100.01, 10000][i];
        s.history[date] = { ...s.history[date], price, change: i % 2 ? -9.99 : 9.99 };
        s.days.find(d => d.date === date).change = s.history[date].change;
        s.sentiment.observations = s.sentiment.observations.filter(p => p.date !== date);
        if (i !== 3) s.sentiment.observations.push({ date, value: [0, 100, 9.1][i], previous: null });
      }
      s.sentiment.observations.sort((a, b) => a.date.localeCompare(b.date));
    }
    await page.route("**/api/markets/*", route => { const market = new URL(route.request().url()).pathname.split("/").at(-1); return route.fulfill({ json: { data: data[market].snapshot } }); });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    // Wait for the React state to receive the fixture rather than the SSR script.
    await inspect(page, "US", dates[1], width < 760);
    await page.waitForFunction(() => document.querySelector("[data-analysis-market=US] .readout-price b")?.textContent === "999,999.99");
    for (const market of ["CN", "US"]) {
      let boxes;
      for (const date of [...dates, "2026-07-25", "2026-03-12"]) {
        const readout = await inspect(page, market, date, width < 760);
        const current = await geometry(readout);
        if (boxes) assert.deepEqual(current, boxes, `${width}px ${market} readout geometry shifted at ${date}`); else boxes = current;
        if (date === dates[3]) { assert.equal(await readout.locator(".readout-emotion b").innerText(), "暂无数据"); assert.notEqual(await readout.locator(".readout-price b").innerText(), "休市"); }
        for (const value of await readout.locator(".readout-label,.readout-value").evaluateAll(es => es.map(e => ({ width: e.clientWidth, scroll: e.scrollWidth })))) assert.ok(value.scroll <= value.width + 1, "readout text clipped");
        await layout(page, `${width} ${market} ${date}`);
      }
      // Hold a real pointer/touch gesture across changing digit counts and signs.
      const start = await point(page, market, dates[0]), end = await point(page, market, dates[1]);
      if (width < 760) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 0 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...end, id: 0 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
      } else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up(); }
      const readout = page.locator(`[data-analysis-market=${market}] .chart-readout`);
      await page.waitForFunction(({ market, date }) => document.querySelector(`[data-analysis-market=${market}] .trend-chart`).dataset.activeDate === date, { market, date: dates[1] });
      assert.deepEqual(await geometry(readout), boxes);
      await page.screenshot({ path: `${out}/${width}-${market}-stable-readout-full.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    report.push({ width, sourcedReport: true, defaultUSCurve: true, closedByMarket: true, missingOpenDayNotClosed: true, stableColumns: true, pointerOrTouchDrag: true, noOverflow: true, errors });
    await context.close();
  }
  await writeFile(`${out}/readout-results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
