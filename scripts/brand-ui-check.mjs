import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { launch, base, out } from './signal-check-utils.mjs';

const browser = await launch(), results = [];
try {
  for (const width of [1440, 390]) for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce', isMobile: width < 500, hasTouch: width < 500 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.six-factor-trigger').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const logo = page.locator('.brand-wordmark:visible');
    await logo.evaluate(el => el.decode());
    assert.match(await logo.getAttribute('src'), scheme === 'dark' ? /wordmark-dark.svg\?v=13$/ : /wordmark.svg\?v=13$/);
    const logoBox = await logo.boundingBox();
    assert.equal(logoBox.width, width === 1440 ? 172 : 126);
    assert.ok(Math.abs(logoBox.height - logoBox.width * 115 / 598) < .1);
    const prefix = `${out}/${width}-${scheme}`;
    await page.locator('header.topbar').screenshot({ path: prefix + '-header.png' });
    async function capture(label) {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const checks = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const elements = [...document.querySelectorAll('main>.foldable-panel,.market-card,.overview-detail,.radar-explanation,.valuation-panel,.stock-technical-panel,.six-factor-trigger')];
        const violations = elements.filter(el => el.checkVisibility() && !el.closest('[inert]')).flatMap(el => {
          const r = el.getBoundingClientRect();
          const clipped = el.scrollWidth > el.clientWidth + 1 || (el.matches('.overview-detail,.radar-explanation') && el.scrollHeight > el.clientHeight + 1);
          return r.left < -1 || r.right > width + 1 || clipped ? [{ class: el.className, left: r.left, right: r.right, clipped }] : [];
        });
        const popup = document.querySelector('.overview-detail,.radar-explanation');
        if (popup) {
          const box = popup.getBoundingClientRect();
          if (box.y < -1 || box.bottom > innerHeight + 1) violations.push({ class: popup.className, viewport: 'vertical overflow' });
          for (const el of popup.querySelectorAll('p,li,h3,h4,span,strong')) {
            if (!el.checkVisibility()) continue;
            const range = document.createRange(); range.selectNodeContents(el);
            for (const r of range.getClientRects()) if (r.width && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)) violations.push({ class: el.className, text: 'outside explanation bounds' });
          }
        }
        return { overflow: document.documentElement.scrollWidth - width, violations };
      });
      assert.ok(checks.overflow <= 0, label + ' page overflow');
      assert.deepEqual(checks.violations, [], label + ' clipped content');
      const popup = page.locator('.overview-detail,.radar-explanation');
      if (await popup.count()) await popup.screenshot({ path: `${prefix}-${label}-detail.png` });
      else await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `${prefix}-${label}-full.png`, fullPage: true });
      results.push({ width, scheme, state: label, ...checks });
    }
    for (const [market, ids] of Object.entries({ CN: ['fearGreed', 'rsi', 'breadth', 'limitRatio', 'turnover', 'relativeTurnover'], US: ['fearGreed', 'priceStrength', 'breadth', 'putCall', 'vix', 'creditSpread'] })) {
      const slider = page.getByRole('slider', { name: '切换市场', exact: true });
      await slider.focus(); await slider.press(market === 'CN' ? 'Home' : 'End');
      await page.locator(`main[data-market="${market}"] .six-factor-trigger`).first().waitFor();
      await capture(market);
      for (const id of ids) {
        await page.locator(`.six-factor-trigger[data-radar-axis="${id}"]`).click();
        await page.locator('.overview-detail').waitFor();
        await capture(market + '-' + id);
        await page.keyboard.press('Escape');
      }
    }
    const search = page.getByRole('combobox', { name: '搜索股票' });
    await search.fill('NVDA');
    await page.getByRole('option').filter({ hasText: 'NVDA' }).click();
    await page.locator('.stock-technical-panel').waitFor();
    await capture('NVDA');
    for (const id of ['rsi', 'ema', 'volatility', 'activity']) {
      await page.locator(`.radar-axis[data-radar-axis="${id}"]`).click();
      await page.locator('.radar-explanation').waitFor();
      await capture('NVDA-' + id);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width}px ${scheme}: both markets and stock, all 16 expanded signals passed`);
  }
  await writeFile(out + '/brand-ui-results.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
