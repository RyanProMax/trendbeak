import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const base = process.env.SIGNAL_PREVIEW_URL || "http://127.0.0.1:8788";
const out = "artifacts/screenshots/signals";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : process.platform === "win32"
      ? { channel: "chrome" }
      : {},
);
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    const initial = await page.evaluate(() =>
      JSON.parse(document.querySelector("#stock-daily-data").textContent),
    );
    assert.ok(initial.markets.CN.snapshot && initial.markets.US.snapshot);
    const instrument = {
      market: "US",
      symbol: "TEST",
      code: "TEST",
      kind: "stock",
      name: "A deliberately long company name for responsive layout verification",
    };
    const quote = structuredClone(initial.markets.US.snapshot);
    quote.instrument = instrument;
    let failed = false;
    await page.route("**/api/search?*", (route) =>
      route.fulfill({ json: { data: [instrument] } }),
    );
    await page.route("**/api/markets/US?*", (route) =>
      failed
        ? route.fulfill({ status: 503, json: { error: "行情暂不可用" } })
        : route.fulfill({ json: { data: quote } }),
    );
    const search = page.getByRole("combobox");
    await search.fill("test");
    await page.getByRole("option").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator(".stock-selected").count(),
      0,
      "Escape suppresses hidden result selection",
    );
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.locator("[data-market=US].stock-selected .signals").waitFor();
    assert.equal(await page.locator(".signals").count(), 2);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    await page.screenshot({
      path: `${out}/${width}-long-name.png`,
      fullPage: true,
    });
    // Existing data remains visible after a refresh fails, with an explicit update state.
    failed = true;
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await page.locator("[data-market=US] .market-refresh-error").waitFor();
    assert.equal(await page.locator(".signals").count(), 2);
    await page.screenshot({
      path: `${out}/${width}-refresh-error.png`,
      fullPage: true,
    });
    await page.locator("[data-market=US] .back-market").click();
    await page.locator("[data-market=US] .market-refresh-error button").waitFor();
    assert.equal(await page.locator("[data-market=CN] .signals").count(), 1);
    await page.screenshot({
      path: `${out}/${width}-unavailable.png`,
      fullPage: true,
    });
    // A retry clears the failure and restores the benchmark.
    failed = false;
    quote.instrument = initial.markets.US.instrument;
    await page.locator("[data-market=US] .market-refresh-error button").click();
    await page.locator("[data-market=US] .signals").waitFor();
    // Stored records are capped in the visible history, and the popup stays in the viewport.
    await page.evaluate(() =>
      localStorage.setItem(
        "stock-daily:search-history:v2",
        JSON.stringify(
          Array.from({ length: 12 }, (_, i) => ({
            market: "US",
            symbol: `T${i}`,
            code: `T${i}`,
            kind: "stock",
            name: `Test ${i}`,
          })),
        ),
      ),
    );
    await page.reload({ waitUntil: "networkidle" });
    await search.click();
    assert.equal(await page.getByRole("option").count(), 10);
    const box = await page.locator(".search-popover").boundingBox();
    assert.ok(
      box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 900,
    );
    await page.screenshot({
      path: `${out}/${width}-history-ten.png`,
      fullPage: true,
    });
    await page.goto(`${base}/offline`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: `${out}/${width}-offline.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    results.push({
      width,
      longName: true,
      refreshFailure: true,
      failedSwitchKeepsQuote: true,
      retry: true,
      historyCount: 10,
      offline: true,
    });
    await context.close();
  }
  await writeFile(
    `${out}/state-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
