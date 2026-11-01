import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { launch, openPage, out } from "./signal-check-utils.mjs";
const browser = await launch(), results = [];
try {
  for (const width of [1440, 390, 320]) {
    const { page, context, initial, errors } = await openPage(browser, width), snapshot = structuredClone(initial.markets.US.snapshot);
    const point = snapshot.sentiment.observations.at(-1), old = { name: "Fear & Greed·转引 CNN", url: "https://fearandgreednow.com/about" };
    snapshot.sentiment = { source: old, description: "旧版本保存的真实转引观测", observations: [{ date: point.date, value: point.value, previous: null, source: old }] };
    snapshot.fetchedAt = new Date(Date.now() - 100).toISOString(); delete snapshot.freshness;
    const record = { schema: 1, storedAt: new Date(Date.now() - 10).toISOString(), snapshot };
    await context.addInitScript(record => { record.snapshot.fetchedAt = new Date(Date.now() - 1).toISOString(); record.storedAt = new Date().toISOString(); localStorage.setItem("trendbeak:last-good:v1", JSON.stringify([record])); }, record);
    let release;const gate=new Promise(resolve=>release=resolve);
    await page.route('**/api/markets/US*',async route=>{await gate;await route.continue();});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-market=US] .quote').waitFor();
    assert.equal(await page.locator('[data-market=US] .snapshot-stale').count(),0,'valid dated backups do not add technical anomaly labels');
    release();await page.waitForLoadState('networkidle');await page.locator('main[data-range-ready=true]').waitFor();
    const chart=page.locator('[data-analysis-market=US] .trend-chart'), server=initial.markets.US.snapshot;
    const start=await chart.getAttribute('data-start'),end=await chart.getAttribute('data-end');
    const expected=server.sentiment.observations.filter(p=>p.date>=start&&p.date<=end).length;
    assert.ok(expected>40);assert.equal(server.sentiment.source.url,'https://github.com/whit3rabbit/fear-greed-data');
    await page.waitForFunction(expected=>Number(document.querySelector('[data-analysis-market=US] .trend-chart')?.dataset.emotionObservations)===expected,expected);
    assert.equal(Number(await chart.getAttribute('data-emotion-observations')),expected);
    assert.ok(await chart.locator(".emotion-line").count()); assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/${width}-legacy-cache-upgrade.png`, fullPage: true });
    results.push({ width, serverRows: server.sentiment.observations.length, visibleRows: expected, legacyRows: 1, databaseSentimentPreserved: true, errors }); await context.close();
  }
  await writeFile(`${out}/legacy-cache-results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
} finally { await browser.close(); }
