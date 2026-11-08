import assert from 'node:assert/strict'; import test from 'node:test'; import { createServer } from 'vite'; import { JSDOM } from 'jsdom'; import React, { act } from 'react'; import { createRoot } from 'react-dom/client';
import { etfInput } from './us-etf-fixture.mjs'; import { calculateETF } from '../scripts/us-etf-valuations.mjs';
test('US date changes abort, ignore late responses and distinguish absent history from read failures', async () => {
  const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://test/' });
  const keys = ['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT', 'Element', 'HTMLElement', 'Node'], saved = Object.fromEntries(keys.map(k => [k, globalThis[k]]));
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of ['Element', 'HTMLElement', 'Node']) globalThis[k] = dom.window[k];
  const requests = []; globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve })); let root;
  try {
    const Component = (await vite.ssrLoadModule('/src/components/USSectorValuations.tsx')).default;
    root = createRoot(document.querySelector('#root'));
    const render = async date => act(async () => root.render(React.createElement(Component, { date })));
    const tick = () => act(async () => new Promise(r => setTimeout(r, 170)));
    await render('2026-11-04'); await tick(); await render('2026-11-05'); await tick();
    assert.equal(requests[0].options.signal.aborted, true);assert.equal(new URL(requests[1].url,'https://test').searchParams.get('format'),'event-equity-v2');
    const row = calculateETF(etfInput()).reading;
    await act(async () => requests[1].resolve(Response.json({ data: { date: '2026-11-05', rows: [row] } })));
    assert.equal(document.querySelector('tbody td b').textContent, '12.50');
    await act(async () => requests[0].resolve(Response.json({ data: { date: '2026-11-04', rows: [] } })));
    assert.equal(document.querySelector('tbody td b').textContent, '12.50');
    assert.equal(document.querySelector('.valuation-status').textContent, '持仓估算');
    assert.ok(!document.body.textContent.includes('分位'));
    await render('2026-11-03'); assert.equal(document.querySelector('tbody td b').textContent, '—'); await tick();
    await act(async () => requests[2].resolve(Response.json({ data: { date: '2026-11-03', rows: [] } })));
    assert.equal(document.querySelector('.valuation-status').textContent, '该日期暂无估值数据');
    await render('2026-11-02'); await tick();
    await act(async () => requests[3].resolve(Response.json({}, { status: 503 })));
    assert.equal(document.querySelector('.valuation-status').textContent, '估值数据暂不可用');
    await render('2026-11-05'); await tick(); assert.equal(requests.length, 4); assert.equal(document.querySelector('tbody td b').textContent, '12.50');
    assert.equal(document.querySelectorAll('tbody tr').length, 11);
  } finally { if (root) await act(async () => root.unmount()); for (const key of keys) globalThis[key] = saved[key]; dom.window.close(); await vite.close(); }
});
