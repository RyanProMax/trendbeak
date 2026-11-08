// Browser-only synthetic valuation cases. Never pass these fixtures to a writer.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { etfInput } from '../tests/us-etf-fixture.mjs';
import { calculateETF } from './us-etf-valuations.mjs';
const base = process.env.SIGNAL_PREVIEW_URL ?? 'http://127.0.0.1:8788', out = process.env.SIGNAL_ARTIFACT_DIR ?? 'artifacts/screenshots/us-etf';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' }), results = [], row = calculateETF(etfInput()).reading;
const sourceComparison={sourceConflict:true,observedAt:'2026-11-08T10:00:00Z',alternateSourceValues:{pb:10,ps:4},deltaPercent:{pb:-20,ps:-20}};
const quarterly={...row,sourceComparison,date:'2026-06-30',asOf:'2026-06-30T20:00:00Z',availableAt:'2026-08-28T15:00:00Z',availableDate:'2026-08-28',pricingBasis:'portfolio_fair_value_per_share'}, comparable={...quarterly,code:'XLC',name:'通信服务',qualityFlags:{...row.qualityFlags,comparableRevenue:1}}, reconstructed={...quarterly,code:'XLF',name:'金融',sourceComparison:undefined,qualityFlags:{...row.qualityFlags,eventReconstructedShares:1}}, proForma={...quarterly,code:'XLI',name:'工业',sourceComparison:undefined,qualityFlags:{...row.qualityFlags,eventProForma:1}};
try {
  for (const width of [1440, 390]) for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/valuations/US?*', route => {
      const date = new URL(route.request().url()).searchParams.get('date');
      return date === '2026-11-03' ? route.fulfill({ status: 503, json: { error: 'fixture' } }) : route.fulfill({ json: { data: { date, rows: date === row.date ? [row] : date === '2026-10-29' ? [quarterly,comparable,reconstructed,proForma] : [] } } });
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    const slider = page.getByRole('slider', { name: '切换市场', exact: true });
    await slider.focus(); await slider.press('End');
    await page.locator('main[data-market="US"]').waitFor();
    const select = async date => { const cell = page.locator(`rect[role="button"][data-date="${date}"]`); await cell.focus(); await cell.press('Enter'); };
    const panel = page.locator('.us-sector-valuations');
    await select(row.date); await page.getByText('持仓估算', { exact: true }).waitFor(); await page.evaluate(() => document.fonts.ready);
    assert.equal(await panel.locator('tbody tr').count(), 11);
    assert.deepEqual(await panel.locator('tbody tr').first().locator('td b').allTextContents(), ['12.50', '5.00']);
    assert.ok(!(await panel.innerText()).includes('分位'));
    assert.equal(await page.locator('.site-disclaimer').innerText(), '仅供学习用途，不作商业行为。');
    const check = async label => {
      const layout = await panel.evaluate(e => ({ page: document.documentElement.scrollWidth > innerWidth, panel: e.scrollWidth > e.clientWidth, outside: [...e.querySelectorAll('th,td,b,strong,small')].filter(x => { const r = x.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).display !== 'inline'; }).map(x => x.outerHTML) }));
      assert.deepEqual(layout, { page: false, panel: false, outside: [] }, label);
    };
    await check('populated'); await page.screenshot({ path: `${out}/${width}-${scheme}-full.png`, fullPage: true }); await panel.screenshot({ path: `${out}/${width}-${scheme}-panel.png` });
    const toggle = panel.locator('.panel-heading button').first();
    await toggle.focus(); await toggle.press('Enter'); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.press('Space'); assert.equal(await toggle.getAttribute('aria-expanded'), 'true'); await check('reopened');
    await select('2026-10-29'); await page.getByText('季度持仓估算 · 2026年6月30日', { exact: true }).waitFor(); await check('quarterly');
    for(const label of ['XLC 可比口径：已调整拆分前收入','XLF 含股本事件估算','XLI 含分拆财务估算']) assert.equal(await page.getByText(label,{exact:true}).count(),1);
    await page.screenshot({path:`${out}/${width}-${scheme}-quarterly-full.png`,fullPage:true}); await panel.screenshot({path:`${out}/${width}-${scheme}-quarterly.png`});
    const conflict=panel.getByRole('button',{name:'XLK 持仓来源有差异',exact:true});await conflict.scrollIntoViewIfNeeded();await conflict.click();
    const tooltip=page.getByRole('tooltip');await tooltip.waitFor({state:'visible'});
    assert.ok((await tooltip.innerText()).includes('核验日期：2026年11月8日'));assert.ok((await tooltip.innerText()).includes('PB 12.50倍 / 10.00倍'));assert.ok((await tooltip.innerText()).includes('PS 5.00倍 / 4.00倍'));assert.ok((await tooltip.innerText()).includes('PB −20.00%'));
    const conflictLayout=await tooltip.evaluate(e=>{const r=e.getBoundingClientRect();return{fits:e.scrollWidth<=e.clientWidth+1,left:r.left,right:r.right,width:innerWidth};});assert.ok(conflictLayout.fits&&conflictLayout.left>=0&&conflictLayout.right<=conflictLayout.width);
    await page.screenshot({path:`${out}/${width}-${scheme}-source-conflict.png`,clip:await tooltip.boundingBox()});
    await page.keyboard.press('Escape');await tooltip.waitFor({state:'hidden'});
    await conflict.click();await tooltip.waitFor({state:'visible'});await toggle.focus();await toggle.press('Enter');await tooltip.waitFor({state:'hidden'});await toggle.press('Enter');await check('conflict collapsed');
    await select('2026-11-04'); await page.getByText('该日期暂无估值数据', { exact: true }).waitFor();
    assert.ok((await panel.locator('td b').allTextContents()).every(v => v === '—')); await check('absent');
    await panel.screenshot({ path: `${out}/${width}-${scheme}-absent.png` });
    await select('2026-11-03'); await page.getByText('估值数据暂不可用', { exact: true }).waitFor();
    assert.ok((await panel.locator('td b').allTextContents()).every(v => v === '—'));
    await select(row.date); await page.getByText('持仓估算', { exact: true }).waitFor();
    await slider.focus(); await slider.press('Home'); assert.equal(await panel.count(), 0);
    await slider.press('End'); await page.getByText('持仓估算', { exact: true }).waitFor(); await check('market return');
    // Full-page and every expanded core signal, for both markets and viewports.
    for (const market of ['CN','US']) {
      await slider.focus(); await slider.press(market==='CN'?'Home':'End');
      await page.locator(`main[data-market="${market}"]`).waitFor();
      const triggers=page.locator('.six-factor-trigger');await triggers.first().waitFor();
      await page.keyboard.press('Escape');await page.mouse.move(0,0);
      await page.screenshot({path:`${out}/${width}-${scheme}-${market}-full.png`,fullPage:true});
      for(let i=0;i<6;i++) {
        const trigger=triggers.nth(i);await trigger.focus();await trigger.press('Enter');
        const detail=page.locator('.overview-detail');await detail.waitFor({state:'visible'});
        const layout=await detail.evaluate(e=>{const r=e.getBoundingClientRect();return{fits:e.scrollWidth<=e.clientWidth+1,left:r.left,right:r.right,width:innerWidth,page:document.documentElement.scrollWidth<=innerWidth};});
        assert.ok(layout.fits&&layout.left>=0&&layout.right<=layout.width&&layout.page,JSON.stringify(layout));
        const id=await trigger.getAttribute('data-radar-axis');
        // Capture the visible detail before a full-page capture can move the viewport.
        const box=await detail.boundingBox();await page.screenshot({path:`${out}/${width}-${scheme}-${market}-${id}-detail.png`,clip:box});
        await page.screenshot({path:`${out}/${width}-${scheme}-${market}-${id}-full.png`,fullPage:true});
        await page.keyboard.press('Escape');
      }
    }
    assert.deepEqual(errors, []); results.push({ width, scheme, populated: true, quarterly: true, sourceConflict: true, eventEstimates: true, absent: true, failure: true, collapse: true, marketReturn: true, expandedCoreSignals:12, noOverflow: true }); await context.close();
  }
  await writeFile(out + '/results.json', JSON.stringify({ fixtureOnly: true, results }, null, 2)); console.log(JSON.stringify(results));
} finally { await browser.close(); }
