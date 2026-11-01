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
    await page.reload({ waitUntil: "networkidle" }); await page.locator("main[data-range-ready=true]").waitFor();
    const chart = page.locator("[data-analysis-market=US] .trend-chart"), server = await page.locator("#trendbeak-data").evaluate(e => JSON.parse(e.textContent).markets.US.snapshot);
    const start = await chart.getAttribute("data-start"), end = await chart.getAttribute("data-end");
    const expected = server.sentiment.observations.filter(p => p.date >= start && p.date <= end).length;
    assert.ok(expected > 40); assert.equal(server.sentiment.source.url, "https://github.com/whit3rabbit/fear-greed-data");
    assert.equal(Number(await chart.getAttribute("data-emotion-observations")), expected);
    assert.equal(await page.locator("[data-market=US] .snapshot-stale").count(), 1, "the newer quote backup must actually be restored");
    assert.ok(await chart.locator(".emotion-line").count()); assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/${width}-legacy-cache-upgrade.png`, fullPage: true });
    results.push({ width, serverRows: server.sentiment.observations.length, visibleRows: expected, legacyRows: 1, databaseSentimentPreserved: true, errors }); await context.close();
  }
  await writeFile(`${out}/legacy-cache-results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
} finally { await browser.close(); }
