import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const base = process.env.SIGNAL_PREVIEW_URL ?? 'http://127.0.0.1:8798';
const out = process.env.SIGNAL_ARTIFACT_DIR ?? 'artifacts/screenshots/market-layout-stability';
await mkdir(out, {recursive: true});
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}
  : {channel: 'chrome'});
const results = [];
const selectors = ['.annual-calendar', '.heat-legend', '.signals-heading', '.trend-wrap', '.trend-range-control', '.signal-radar'];

async function startFrames(page) {
  await page.evaluate(selectors => {
    cancelAnimationFrame(window.__layoutFrameRequest);
    window.__layoutFrames = [];
    window.__captureLayout = true;
    const sample = () => {
      const main = document.querySelector('main');
      const elements = Object.fromEntries(selectors.map(selector => {
        const element = document.querySelector(selector);
        if (!element) return [selector, null];
        const rect = element.getBoundingClientRect();
        return [selector, {y: rect.y + scrollY, h: rect.height}];
      }));
      window.__layoutFrames.push({scroll: scrollY, documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, market: main.dataset.market,
        transform: getComputedStyle(main).transform, opacity: Number(getComputedStyle(main).opacity), elements});
      if (window.__captureLayout) window.__layoutFrameRequest = requestAnimationFrame(sample);
    };
    sample();
  }, selectors);
}
async function stopFrames(page) {
  return page.evaluate(() => {window.__captureLayout = false; cancelAnimationFrame(window.__layoutFrameRequest); return window.__layoutFrames;});
}
async function pointer(page, market, noScroll = false) {
  const slider = page.getByRole('slider', {name: '切换市场', exact: true});
  if (!noScroll) {
    const rect = await slider.boundingBox();
    await page.mouse.click(rect.x + rect.width * (market === 'US' ? .8 : .2), rect.y + rect.height / 2);
    return;
  }
  // Dispatch through React's actual input handler without auto-scrolling a control offscreen.
  await slider.evaluate((element, market) => {
    element.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'mouse'}));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, market === 'US' ? '1' : '0');
    element.dispatchEvent(new Event('input', {bubbles: true}));
    element.dispatchEvent(new Event('change', {bubbles: true}));
    element.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerType: 'mouse'}));
  }, market);
}
function checkFrames(frames, {sameWindow, reducedMotion, label}) {
  assert.ok(frames.length > 3, `${label}: enough animation frames`);
  for (const frame of frames) {
    assert.equal(frame.transform, 'none', `${label}: main must not translate`);
    if (reducedMotion === 'reduce') assert.equal(frame.opacity, 1, `${label}: reduced motion`);
    for (const selector of selectors) assert.ok(frame.elements[selector], `${label}: ${selector} remains present`);
  }
  let maxStep = 0;
  for (const selector of selectors) {
    const values = frames.map(frame => frame.elements[selector].y);
    const first = values[0], last = values.at(-1);
    for (let i = 1; i < values.length; i++) maxStep = Math.max(maxStep, Math.abs(values[i] - values[i - 1]));
    if (sameWindow) assert.ok(Math.max(...values) - Math.min(...values) < .5, `${label}: ${selector} jumps`);
    else {
      // Different saved windows may legitimately change height once, but cannot expose a measured-width/default-window intermediate frame.
      const transitions = values.slice(1).filter((value, i) => Math.abs(value - values[i]) > .5).length;
      assert.ok(transitions <= 1, `${label}: ${selector} has ${transitions} layout steps`);
      assert.ok(values.every(value => Math.abs(value - first) < .5 || Math.abs(value - last) < .5), `${label}: intermediate geometry`);
    }
  }
  return maxStep;
}
try {
  for (const width of [1440, 390, 320]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({viewport: {width, height: 900}, reducedMotion});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, {waitUntil: 'networkidle'});
    await page.locator('button.six-factor-trigger').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    let release, requested = false;
    const gate = new Promise(resolve => {release = resolve;});
    await page.route('**/api/markets/US*', async route => {requested = true; await gate; await route.continue();});
    for (const [name, market] of [['coldUS', 'US'], ['warmCN', 'CN'], ['warmUS', 'US'], ['rapidCN', 'CN']]) {
      await startFrames(page);
      await pointer(page, market);
      if (name === 'coldUS') {
        await page.waitForTimeout(250);
        assert.ok(requested, 'Cold switch must request US data');
        assert.equal(await page.locator('.signals-skeleton button').count(), 0, 'Loading placeholders are not interactive');
        release();
        await page.locator('button.six-factor-trigger').first().waitFor();
      }
      if (name === 'rapidCN') {
        await page.waitForTimeout(35); await pointer(page, 'US');
        await page.waitForTimeout(35); await pointer(page, 'CN');
      }
      await page.waitForTimeout(300);
      const frames = await stopFrames(page), label = `${width}/${reducedMotion}/${name}`;
      const maxStep = checkFrames(frames, {sameWindow: true, reducedMotion, label});
      assert.equal(frames.at(-1).market, market, label + ': correct final market');
      const readout = await page.locator('.chart-readout').evaluate(element => ({width: element.clientWidth, contentWidth: element.scrollWidth}));
      assert.ok(readout.contentWidth <= readout.width + 1, label + ': readout must not overflow its content area');
      results.push({width, reducedMotion, name, maxStep, readout, frames});
    }
    assert.deepEqual(errors, []);
    await page.screenshot({path: `${out}/${width}-${reducedMotion}.png`, fullPage: true});
    await context.close();
  }
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({viewport: {width, height: 650}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    await page.goto(base, {waitUntil: 'networkidle'});
    await page.locator('button.six-factor-trigger').first().waitFor();
    const end = await page.locator('.trend-range-control').getAttribute('data-end');
    await page.evaluate(end => {
      for (const [market, days] of [['CN', 30], ['US', 365]]) sessionStorage.setItem('trendbeak:window:v2:' + market,
        JSON.stringify({start: new Date(Date.parse(end) - (days - 1) * 86400000).toISOString().slice(0, 10), end}));
    }, end);
    await page.reload({waitUntil: 'networkidle'});
    await page.locator('button.six-factor-trigger').first().waitFor();
    for (const scroll of (process.env.DEEP_SCROLL === '1' ? [0, 280, 700, 1100, 1800, 2500] : [0, 280])) for (const market of ['US', 'CN']) {
      await page.evaluate(scroll => scrollTo(0, scroll), scroll);
      await page.waitForTimeout(100);
      await startFrames(page); await pointer(page, market, true);
      await page.waitForTimeout(900);
      const frames = await stopFrames(page), label = `${width}/saved/${scroll}/${market}`;
      checkFrames(frames, {sameWindow: false, reducedMotion: 'reduce', label});
      if (scroll <= 280) assert.ok(frames.every(frame => Math.abs(frame.scroll - scroll) < .5), label + ': scroll preserved');
      else {
        const scrollSteps = frames.slice(1).filter((frame, i) => Math.abs(frame.scroll - frames[i].scroll) > .5).length;
        assert.ok(scrollSteps <= 1, label + ': no repeated scroll jumps');
        assert.ok(frames.every(frame => frame.scroll >= 0 && frame.scroll <= Math.max(0, frame.documentHeight - frame.viewportHeight) + 1), label + ': scroll remains within document');
      }
      assert.equal(frames.at(-1).market, market);
      const days = await page.locator('.trend-range-control').evaluate(element =>
        (Date.parse(element.dataset.end) - Date.parse(element.dataset.start)) / 86400000 + 1);
      assert.equal(days, market === 'CN' ? 30 : 365);
      results.push({width, name: 'savedWindow', scroll, market, days, frames});
    }
    await context.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({passed: true, cases: results.length, defaultWindowMaxStep: Math.max(...results.filter(r => r.maxStep !== undefined).map(r => r.maxStep))}));
} finally {await browser.close();}
