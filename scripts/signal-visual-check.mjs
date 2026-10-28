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
const report = [];
async function layout(page, label) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const selectors = [
      ".market-card",
      ".market-top",
      ".market-title",
      ".date-control",
      ".quote-date",
      ".calendar-section",
      ".react-activity-calendar svg",
      ".signal-trigger",
      ".signal-tooltip",
      ".search-popover",
    ];
    return {
      width: viewport,
      scrollWidth: document.documentElement.scrollWidth,
      invalid: selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].flatMap((el) => {
          const r = el.getBoundingClientRect();
          const clipped =
            el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1;
          return r.left < -1 || r.right > viewport + 1 || clipped
            ? [{ selector, left: r.left, right: r.right, clipped }]
            : [];
        }),
      ),
    };
  });
  assert.equal(result.scrollWidth, result.width, `${label}: page overflow`);
  assert.deepEqual(result.invalid, [], `${label}: component overflow`);
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      isMobile: width === 390,
      hasTouch: width === 390,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration|React error/i.test(message.text())
      )
        errors.push(message.text());
    });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.locator(".signal-trigger").nth(9).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await layout(page, `${width} initial`);
    assert.equal(await page.locator(".calendar-detail").count(), 0);
    const header = await page.locator(".topbar").boundingBox();
    assert.equal(header.x, 0, `${width}: header left gutter`);
    assert.equal(header.width, await page.evaluate(() => document.documentElement.clientWidth), `${width}: header width`);
    const accents = await page.locator(".market-card").evaluateAll((cards) => cards.map((card) => {
      const style = getComputedStyle(card), accent = getComputedStyle(card, "::before");
      return {
        width: card.getBoundingClientRect().width,
        accentWidth: parseFloat(accent.width),
        left: parseFloat(style.borderLeftWidth) + parseFloat(accent.left),
        right: parseFloat(style.borderRightWidth) + parseFloat(accent.right),
        radius: style.borderTopLeftRadius,
        accentRadius: accent.borderTopLeftRadius,
        height: parseFloat(accent.height),
        backgroundSize: accent.backgroundSize,
        pointerEvents: accent.pointerEvents,
      };
    }));
    for (const accent of accents) {
      assert.equal(accent.left, 0, `${width}: accent left inset`);
      assert.equal(accent.right, 0, `${width}: accent right inset`);
      assert.ok(Math.abs(accent.width - accent.accentWidth) < 1, `${width}: accent width`);
      assert.equal(accent.accentRadius, accent.radius, `${width}: accent corner radius`);
      assert.ok(accent.height > parseFloat(accent.radius) * 2, `${width}: accent must follow the full card curve`);
      assert.equal(accent.backgroundSize, "100% 2px", `${width}: accent thickness`);
      assert.equal(accent.pointerEvents, "none", `${width}: accent intercepts interaction`);
    }
    const centered = await page.locator(".search-wrap").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2 - window.innerWidth / 2;
    });
    assert.ok(
      Math.abs(centered) < 1,
      `${width}: search off-center ${centered}`,
    );
    await page.screenshot({ path: `${out}/${width}-full.png`, fullPage: true });
    const before = await page
      .locator(".signals")
      .evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().top + scrollY),
      );
    // Cover every date, including non-trading and missing observations.
    const hoverLayout = await page.evaluate(async () => {
      const targets = [...document.querySelectorAll(".signals")];
      const badges = [...document.querySelectorAll(".quote-date")];
      const badgeInitial = badges.map((el) => el.getBoundingClientRect());
      const initial = targets.map(
        (el) => el.getBoundingClientRect().top + scrollY,
      );
      let maxShift = 0;
      let maxBadgeShift = 0;
      let maxDateSessionGap = 0;
      const clippedDates = [];
      for (const rect of document.querySelectorAll(
        ".calendar-section rect[role=button]",
      )) {
        rect.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        targets.forEach((el, i) => {
          maxShift = Math.max(
            maxShift,
            Math.abs(el.getBoundingClientRect().top + scrollY - initial[i]),
          );
        });
        badges.forEach((el, i) => {
          const box = el.getBoundingClientRect(), original = badgeInitial[i];
          maxBadgeShift = Math.max(maxBadgeShift, Math.abs(box.x - original.x), Math.abs(box.width - original.width), Math.abs(box.height - original.height));
          if (el.scrollWidth > el.clientWidth + 1) clippedDates.push(rect.dataset.date);
          const date = el.querySelector("time").getBoundingClientRect();
          const session = el.querySelector(".quote-session").getBoundingClientRect();
          maxDateSessionGap = Math.max(maxDateSessionGap, session.left - date.right);
        });
        rect.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      }
      return { maxShift, maxBadgeShift, maxDateSessionGap, clippedDates };
    });
    const maxHoverShift = hoverLayout.maxShift;
    const after = await page
      .locator(".signals")
      .evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().top + scrollY),
      );
    assert.deepEqual(after, before, `${width}: calendar hover shifts signals`);
    assert.equal(maxHoverShift, 0, `${width}: transient hover shift`);
    assert.equal(hoverLayout.maxBadgeShift, 0, `${width}: date badge moves or resizes on hover`);
    assert.deepEqual(hoverLayout.clippedDates, [], `${width}: date badge clips text`);
    assert.ok(hoverLayout.maxDateSessionGap <= 5, `${width}: date and session spaced apart`);
    for (let index = 0; index < 10; index++) {
      const trigger = page.locator(".signal-trigger").nth(index);
      await trigger.scrollIntoViewIfNeeded();
      const top = await trigger.evaluate(
        (el) => el.getBoundingClientRect().top + scrollY,
      );
      if (width === 390) await trigger.tap();
      else await trigger.hover();
      const bubble = page.locator(".signal-tooltip");
      await bubble.waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await layout(page, `${width} signal ${index}`);
      const box = await bubble.boundingBox();
      assert.ok(
        box.y >= 0 && box.y + box.height <= 900,
        `${width}: tooltip outside vertical viewport`,
      );
      assert.equal(
        await trigger.evaluate(
          (el) => el.getBoundingClientRect().top + scrollY,
        ),
        top,
        `${width}: signal expanded`,
      );
      await page.screenshot({
        path: `${out}/${width}-signal-${index}.png`,
        fullPage: true,
      });
      await bubble.screenshot({ path: `${out}/${width}-bubble-${index}.png` });
      await page.keyboard.press("Escape");
      await page.mouse.move(0, 0);
      await bubble.waitFor({ state: "hidden" });
    }
    // Keyboard focus must expose the same information and Escape must dismiss it.
    await page.locator(".signal-trigger").first().focus();
    await page.locator(".signal-tooltip").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".signal-tooltip").waitFor({ state: "hidden" });
    await page.locator(".signal-trigger").first().blur();
    await page.evaluate(() => scrollTo(0, 0));
    const search = page.getByRole("combobox");
    for (const [query, market, name] of [
      ["600519", "CN", "贵州茅台"],
      ["英伟达", "US", "英伟达"],
    ]) {
      await search.fill(query);
      await page
        .getByRole("option")
        .filter({ hasText: name })
        .first()
        .waitFor();
      await layout(page, `${width} search ${market}`);
      await page.screenshot({
        path: `${out}/${width}-search-${market}.png`,
        fullPage: true,
      });
      await page.getByRole("option").filter({ hasText: name }).first().click();
      await page
        .locator(`[data-market=${market}].stock-selected .signals`)
        .waitFor();
      await page.waitForFunction(
        (market) =>
          !document
            .querySelector(`[data-market=${market}]`)
            .hasAttribute("aria-busy"),
        market,
      );
      assert.equal(await page.locator(".signals").count(), 2);
      await layout(page, `${width} selected ${market}`);
    }
    await page.screenshot({
      path: `${out}/${width}-stocks.png`,
      fullPage: true,
    });
    await page.reload({ waitUntil: "networkidle" });
    await search.click();
    await page.getByText("最近搜索", { exact: true }).waitFor();
    assert.equal(await page.getByRole("option").count(), 2);
    await layout(page, `${width} history`);
    await page.screenshot({
      path: `${out}/${width}-history.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "清空", exact: true }).click();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("stock-daily:search-history:v2"),
      ),
      null,
    );
    // Adding/removing native scrollbar must preserve the search center.
    const centers = [];
    for (const overflow of ["hidden", "scroll", ""]) {
      await page.evaluate((value) => {
        document.documentElement.style.overflowY = value;
      }, overflow);
      centers.push(
        await page.locator(".search-wrap").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.x + r.width / 2;
        }),
      );
      const header = await page.locator(".topbar").boundingBox();
      assert.equal(header.x, 0, `${width} ${overflow}: header left gutter`);
      assert.equal(header.width, await page.evaluate(() => document.documentElement.clientWidth), `${width} ${overflow}: header width`);
    }
    assert.ok(
      Math.max(...centers) - Math.min(...centers) < 1,
      `${width}: scrollbar shifts center`,
    );
    assert.deepEqual(errors, [], `${width}: browser errors`);
    report.push({
      width,
      centerOffset: centered,
      maxHoverShift,
      maxDateBadgeShift: hoverLayout.maxBadgeShift,
      maxDateSessionGap: hoverLayout.maxDateSessionGap,
      tooltips: 10,
      searches: 2,
      errors,
    });
    await context.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
