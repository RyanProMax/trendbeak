// Browser-only synthetic rank edge cases; never imported into a database.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { launch, base, out } from './signal-check-utils.mjs';
const browser = await launch(), results = [];
try {
  for (const width of [1440, 390]) for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce', isMobile: width === 390, hasTouch: width === 390 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/valuations/US/themes?*', route => {
      const date = new URL(route.request().url()).searchParams.get('date');
      const metric = (value, percentile) => ({ value, percentile, samples: 100, from: '2026-01-02', through: '2026-11-04' });
      const rows = date === '2026-11-05' ? [
        { name: '半导体', code: 'SOX', date, availableDate: date, pb: metric(8, 0), ps: metric(5, 100) },
        { name: '存储', code: 'STXWSML', date, pb: { value: 3, percentile: null, samples: 0 }, ps: { value: null, percentile: null, samples: 0 } },
      ] : [];
      return date === '2026-11-03' ? route.fulfill({ status: 503, json: { error: 'test only' } }) : route.fulfill({ json: { data: { date, rows } } });
    });
    await page.goto(base + '?market=US', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'AI 板块', exact: true }).click();
    const panel = page.locator('.us-theme-valuations'); await panel.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const select = async date => { const cell = page.locator(`rect[role="button"][data-date="${date}"]`); await cell.focus(); await cell.press('Enter'); };
    const capture = async label => {
      // Tall category panels scroll during capture; park the pointer outside
      // the table so it cannot hover a second reading as the page moves.
      await page.mouse.move(0, 0);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const checks = await page.evaluate(() => {
        const selectors = '.us-theme-valuations,.us-theme-valuations th,.us-theme-valuations td,.valuation-trigger,.valuation-tooltip';
        return { overflow: document.documentElement.scrollWidth > innerWidth, clipped: [...document.querySelectorAll(selectors)].filter(e => e.checkVisibility()).flatMap(e => {
          const r = e.getBoundingClientRect();
          return r.left < -1 || r.right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1 ? [e.className] : [];
        }) };
      });
      assert.deepEqual(checks, { overflow: false, clipped: [] }, label);
      await page.screenshot({ path: `${out}/${width}-${scheme}-${label}-full.png`, fullPage: true });
      await panel.screenshot({ path: `${out}/${width}-${scheme}-${label}-panel.png` });
      const tooltip = page.locator('.valuation-tooltip'); if (await tooltip.count()) await tooltip.screenshot({ path: `${out}/${width}-${scheme}-${label}-tooltip.png` });
    };
    await select('2026-11-05'); await panel.getByText('0.0%', { exact: true }).waitFor();
    assert.deepEqual(await panel.locator('tbody th strong').allTextContents(), ['半导体', '存储', '光连接', '数据中心', 'AI 电力基建', '云计算', '云软件', '网络安全', '机器人']);
    assert.deepEqual(await panel.locator('tbody tr').first().locator('td b').allTextContents(), ['0.0%', '100.0%']);
    assert.deepEqual(await panel.locator('.valuation-track i').evaluateAll(es => es.map(e => e.style.width)), ['0%', '100%']);
    assert.deepEqual(await panel.locator('tbody tr').nth(1).locator('td b').allTextContents(), ['—', '—']);
    assert.deepEqual(await panel.locator('tbody tr').nth(1).locator('td small').allTextContents(), []);
    assert.ok(!(await panel.innerText()).includes('持仓来源有差异'));
    await capture('fixture-ranks');
    for (const metric of ['PB', 'PS']) {
      await panel.getByRole('button', { name: `了解 ${metric} 指标` }).click();
      const tooltip = page.locator('.valuation-tooltip'); await tooltip.waitFor();
      assert.ok(!(await tooltip.innerText()).includes('分位表示'));
      await capture('fixture-' + metric + '-help'); await page.keyboard.press('Escape'); await page.mouse.move(0, 0);
    }
    await panel.getByRole('button', { name: '半导体 PB 分位，查看数据覆盖时长', exact: true }).click();
    await page.locator('.valuation-tooltip').waitFor(); await capture('fixture-coverage');
    await panel.getByRole('button', { name: '传统行业', exact: true }).click();
    await page.locator('.valuation-tooltip').waitFor({ state: 'hidden' });
    assert.equal(await panel.locator('tbody tr').count(), 11);
    assert.equal(await panel.locator('.valuation-track i').count(), 0);
    await capture('fixture-traditional');
    await panel.getByRole('button', { name: '宽基', exact: true }).focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await panel.locator('tbody th strong').allTextContents(), ['标普500', '纳斯达克100']);
    await capture('fixture-broad');
    await panel.getByRole('button', { name: 'AI 板块', exact: true }).click();
    const toggle = panel.locator('.panel-heading button').first();
    await toggle.focus(); await toggle.press('Enter'); await page.locator('.valuation-tooltip').waitFor({ state: 'hidden' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false'); await toggle.press('Enter'); await capture('fixture-reopened');
    await select('2026-11-04'); await page.waitForFunction(() => {const t=document.querySelector('.us-theme-valuations table');return t?.getAttribute('data-valuation-date')==='2026-11-04'&&t.getAttribute('aria-busy')==='false';});
    assert.equal(await panel.locator('.valuation-track i').count(), 0); await capture('fixture-absent');
    await select('2026-11-03'); await page.waitForFunction(() => {const t=document.querySelector('.us-theme-valuations table');return t?.getAttribute('data-valuation-date')==='2026-11-03'&&t.getAttribute('aria-busy')==='false';});
    assert.ok(!/暂无估值|暂不可用|正在读取/.test(await panel.innerText())); await capture('fixture-failure');
    assert.deepEqual(errors, []); results.push({ width, scheme, rankBoundaries: true, unrankedMultiple: true, absent: true, failure: true, noOverflow: true });
    await context.close();
    console.log(`${width}px ${scheme}: theme valuation states passed (fixtures only)`);
  }
  await writeFile(out + '/results.json', JSON.stringify({ fixtureOnly: true, results }, null, 2));
} finally { await browser.close(); }
