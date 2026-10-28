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
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    const initial = await page.evaluate(() =>
      JSON.parse(document.querySelector("#stock-daily-data").textContent),
    );
    assert.equal(await page.locator(".market-period").count(), 1);
    for (const market of ["CN", "US"]) {
      const snapshot = initial.markets[market].snapshot;
      const date = Object.keys(snapshot.history).sort().at(-40),
        expected = snapshot.history[date];
      const card = page.locator(`[data-market=${market}]`);
      const dateBackground = await card.locator(".quote-date").evaluate((el) => getComputedStyle(el).backgroundImage);
      assert.match(dateBackground, /linear-gradient/);
      const counterpart = await page
        .locator(`[data-market=${market === "CN" ? "US" : "CN"}] .signals`)
        .innerText();
      const cell = card.locator(`rect[data-date="${date}"]`);
      await cell.click();
      await page.waitForTimeout(250);
      assert.equal(
        await card.locator(".signals").getAttribute("data-date"),
        date,
      );
      for (const [id, value] of Object.entries(expected.values)) {
        const meter = card.locator(`[data-signal=${id}] [role=meter]`);
        if (value === null)
          assert.equal(await meter.getAttribute("aria-valuenow"), null);
        else {
          const min = Number(await meter.getAttribute("aria-valuemin")),
            max = Number(await meter.getAttribute("aria-valuemax"));
          assert.ok(
            Math.abs(
              Number(await meter.getAttribute("aria-valuenow")) -
                Math.max(min, Math.min(max, value)),
            ) < 1e-9,
          );
        }
      }
      assert.equal(
        await page
          .locator(`[data-market=${market === "CN" ? "US" : "CN"}] .signals`)
          .innerText(),
        counterpart,
      );
      assert.equal(
        await cell.evaluate((el) => getComputedStyle(el).outlineStyle),
        "none",
      );
      assert.equal(
        await cell.evaluate((el) => getComputedStyle(el).stroke),
        "rgb(255, 255, 255)",
      );
      assert.equal(await card.locator(".date-control.is-historical").count(), 1);
      assert.equal(await card.locator(".quote-date time").getAttribute("datetime"), date);
      assert.equal(await card.locator(".quote-date").evaluate((el) => getComputedStyle(el).backgroundImage), dateBackground);
      const hovered = snapshot.days.find((day) => day.change !== null && day.date !== date);
      const quote = await card.locator(".quote-row").innerText();
      await card.locator(`rect[data-date="${hovered.date}"]`).hover();
      assert.equal(await card.locator(".quote-date time").getAttribute("datetime"), hovered.date);
      const expectedChange = `${hovered.change < 0 ? "−" : hovered.change > 0 ? "+" : ""}${Math.abs(hovered.change).toFixed(2)}%`;
      assert.equal(await card.locator(".quote-date strong").innerText(), expectedChange);
      assert.equal(await card.locator(".quote-row").innerText(), quote);
      assert.equal(await card.locator(".signals").getAttribute("data-date"), date);
      await page.mouse.move(0, 0);
      assert.equal(await card.locator(".quote-date time").getAttribute("datetime"), date);
      const latest = card.getByRole("button", { name: "返回最新日期" });
      const latestBox = await latest.boundingBox();
      const dateBox = await card.locator(".quote-date").boundingBox();
      assert.ok(latestBox.x + latestBox.width <= dateBox.x);
      if (width === 1440) await latest.hover();
      else await latest.focus();
      await page.getByRole("tooltip", { name: "返回最新日期" }).waitFor();
      await page.screenshot({ path: `${out}/${width}-latest-date-${market}.png`, fullPage: true });
      await page.keyboard.press("Escape");
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: `${out}/${width}-history-${market}-selected.png`,
        fullPage: true,
      });
      await card
        .locator(".calendar-section")
        .screenshot({
          path: `${out}/${width}-calendar-selection-${market}.png`,
        });
      // Every historical tooltip must stay within the viewport too.
      for (let i = 0; i < 5; i++) {
        const trigger = card.locator(".signal-trigger").nth(i);
        await trigger.scrollIntoViewIfNeeded();
        if (width === 390) await trigger.tap();
        else await trigger.hover();
        const bubble = page.locator(".signal-tooltip");
        await bubble.waitFor();
        await page.waitForTimeout(200);
        const box = await bubble.boundingBox();
        assert.ok(
          box.x >= 0 &&
            box.x + box.width <= width &&
            box.y >= 0 &&
            box.y + box.height <= 900,
        );
        await page.screenshot({
          path: `${out}/${width}-historical-${market}-signal-${i}.png`,
          fullPage: true,
        });
        await bubble.screenshot({
          path: `${out}/${width}-historical-${market}-bubble-${i}.png`,
        });
        await page.keyboard.press("Escape");
        await page.mouse.move(0, 0);
      }
      // Closed dates cannot replace a trading-day selection, even through synthetic events.
      const closed = snapshot.days.find(
        (day) => day.status === "closed" && day.date > date,
      ).date;
      const closedCell = card.locator(`rect[data-date="${closed}"]`);
      assert.equal(
        await card.locator('rect[aria-disabled="true"]').count(),
        snapshot.days.filter((day) => day.status === "closed").length,
      );
      assert.equal(await closedCell.getAttribute("aria-disabled"), "true");
      assert.equal(await closedCell.getAttribute("tabindex"), "-1");
      const priorReadings = await card.locator(".signals").innerText();
      await closedCell.dispatchEvent("click");
      for (const key of ["Enter", " ", "ArrowLeft"])
        await closedCell.dispatchEvent("keydown", { key });
      assert.equal(await card.locator(".signals").getAttribute("data-date"), date);
      assert.equal(await card.locator(".signals").innerText(), priorReadings);
      await closedCell.hover();
      assert.equal(await card.locator(".quote-date time").getAttribute("datetime"), closed);
      assert.equal(await card.locator(".quote-session").innerText(), "休市");
      await page.getByRole("tooltip", { name: "休市", exact: true }).waitFor();
      const closedBox = await page.locator(".closed-tooltip").boundingBox();
      assert.ok(closedBox.x >= 0 && closedBox.x + closedBox.width <= width);
      await page.screenshot({
        path: `${out}/${width}-closed-${market}.png`,
        fullPage: true,
      });
      const holiday = snapshot.days.find((day) => day.status === "closed" &&
        ![0, 6].includes(new Date(`${day.date}T12:00:00Z`).getUTCDay()));
      assert.ok(holiday, `${market}: verified weekday holiday missing`);
      const holidayCell = card.locator(`rect[data-date="${holiday.date}"]`);
      await holidayCell.dispatchEvent("click");
      assert.equal(await card.locator(".signals").getAttribute("data-date"), date);
      await holidayCell.hover();
      await page.getByRole("tooltip", { name: "休市", exact: true }).waitFor();
      await page.screenshot({ path: `${out}/${width}-holiday-${market}.png`, fullPage: true });
      await page.mouse.move(0, 0);
      await cell.focus();
      // Crossing a weekend with the vertical arrow must skip every closed day.
      const beforeClosed = snapshot.days.find((day, i, days) =>
        day.status !== "closed" && days[i + 1]?.status === "closed" && day.date >= date,
      );
      await card.locator(`rect[data-date="${beforeClosed.date}"]`).click();
      await page.keyboard.press("ArrowDown");
      const keyboardDate = await card.locator(".signals").getAttribute("data-date");
      assert.notEqual(snapshot.days.find((day) => day.date === keyboardDate).status, "closed");
      assert.notEqual(
        keyboardDate,
        beforeClosed.date,
      );
      await latest.click();
      assert.equal(
        await card.locator(".signals").getAttribute("data-date"),
        snapshot.asOf,
      );
      assert.equal(await card.locator(".date-control.is-historical").count(), 0);
      assert.equal(await latest.count(), 0);
      assert.equal(await card.locator(".quote-date").evaluate((el) => getComputedStyle(el).backgroundImage), dateBackground);
    }
    // Delay an actual quote to inspect pending and atomic commit behavior.
    const stock = await page.request
      .get(`${base}/api/markets/CN?symbol=600519.SS`)
      .then((r) => r.json());
    assert.ok(stock.data);
    let finish;
    const gate = new Promise((resolve) => {
      finish = resolve;
    });
    await page.route("**/api/markets/CN?symbol=600519.SS", async (route) => {
      await gate;
      await route.fulfill({ json: stock });
    });
    await page.evaluate(() => scrollTo(0, 0));
    const card = page.locator("[data-market=CN]");
    const originalHeight = (await card.boundingBox()).height;
    const originalName = await card.locator(".quote-top h3").innerText();
    const originalQuote = await card.locator(".quote").innerText();
    await page.getByRole("combobox").fill("600519");
    await page.getByRole("option").filter({ hasText: "贵州茅台" }).click();
    await card.locator(".market-loading").waitFor();
    await page.waitForTimeout(220);
    assert.equal(await card.locator(".quote-top h3").innerText(), originalName);
    assert.equal(await card.locator(".quote").innerText(), originalQuote);
    assert.equal(await card.locator(".signals").count(), 1);
    assert.equal((await card.boundingBox()).height, originalHeight);
    await page.screenshot({
      path: `${out}/${width}-switch-pending.png`,
      fullPage: true,
    });
    finish();
    await card.locator(".market-loading").waitFor({ state: "hidden" });
    await page.waitForTimeout(250);
    assert.match(await card.locator(".quote-top h3").innerText(), /贵州茅台/);
    const heightChange = Math.abs(
      (await card.boundingBox()).height - originalHeight,
    );
    assert.ok(heightChange < 1, `card resized ${heightChange}px`);
    assert.equal(
      await page.evaluate(() => scrollY),
      0,
      "visible target should not trigger page scroll",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    await page.screenshot({
      path: `${out}/${width}-switch-complete.png`,
      fullPage: true,
    });
    const stockDate = Object.keys(stock.data.history).sort().at(-30);
    await card.locator(`rect[data-date="${stockDate}"]`).click();
    assert.equal(await card.locator(".date-control.is-historical time").getAttribute("datetime"), stockDate);
    await card.getByRole("button", { name: "返回最新日期" }).click();
    assert.equal(await card.locator(".signals").getAttribute("data-date"), stock.data.asOf);
    results.push({
      width,
      historicalMarkets: 2,
      historicalTooltips: 10,
      closedDatesDisabled: true,
      closedHoverTooltip: true,
      sharedDateRange: true,
      highlightedDateAndReset: true,
      keyboardSelection: true,
      switchHeightChange: heightChange,
      forcedScroll: false,
    });
    await context.close();
  }
  await writeFile(
    `${out}/history-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
