import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';

// Opt-in browser regression against a built local app, using an unchanged dated fixture.
// TREND_NAVIGATION_URL=http://127.0.0.1:8803 node --test tests/navigation-race-browser.test.mjs
const base = process.env.TREND_NAVIGATION_URL;
test('history restoration cancels a pending stock selection and preserves authoritative URL/name', { skip: !base }, async () => {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Use only a local test server');
  const fixture = await (await fetch(new URL('/api/markets/US?symbol=NVDA&view=sentiment-v1',base))).json();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : process.platform === 'darwin' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage();
    await page.addInitScript(instrument => localStorage.setItem('trendbeak:search-history:v1', JSON.stringify([instrument])), fixture.data.instrument);
    let release;
    let resolveRequested;
    let requested = new Promise(resolve => { resolveRequested = resolve; });
    await page.route('**/api/markets/**', async route => {
      if (new URL(route.request().url()).searchParams.get('symbol') !== 'NVDA') return route.continue();
      const gate = new Promise(resolve => { release = resolve; });
      resolveRequested();
      await gate;
      await route.fulfill({ json: fixture }).catch(() => {}); // Navigation may abort this request.
    });
    await page.goto(new URL('/?market=US', base).href);
    await page.locator('main[data-market="US"][data-range-ready="true"]').waitFor();
    await page.getByRole('combobox').focus();
    await page.getByRole('option').filter({ hasText: 'NVDA' }).click();
    await requested;
    await page.getByRole('slider', { name: '切换市场' }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.goBack();
    await page.locator('main[data-market="US"]').waitFor();
    release();
    await page.waitForTimeout(800);
    assert.equal(new URL(page.url()).searchParams.get('symbol'), null);
    assert.equal(await page.getByRole('combobox').inputValue(), '');

    requested = new Promise(resolve => { resolveRequested = resolve; });
    await page.getByRole('combobox').focus();
    await page.getByRole('option').filter({ hasText: 'NVDA' }).click();
    await requested;
    release();
    await page.waitForURL(url => url.searchParams.get('symbol') === 'NVDA');
    assert.equal(await page.getByRole('combobox').inputValue(), `${fixture.data.instrument.name} · ${fixture.data.instrument.code}`);
    await page.getByRole('button', { name: '清空股票，返回大盘' }).click();
    await page.waitForURL(url => !url.searchParams.has('symbol'));
    assert.equal(await page.getByRole('combobox').inputValue(), '');
    requested = new Promise(resolve => { resolveRequested = resolve; });
    await page.goBack();
    await requested;
    release();
    await page.waitForFunction(() => document.querySelector('[role="combobox"]').value.includes('NVDA'));
    assert.equal(new URL(page.url()).searchParams.get('symbol'), 'NVDA');
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('[role="combobox"]').value === '');
    assert.equal(new URL(page.url()).searchParams.get('symbol'), null);
  } finally {
    await browser.close();
  }
});
