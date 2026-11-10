import assert from 'node:assert/strict'; import test from 'node:test'; import { createServer } from 'vite'; import { JSDOM } from 'jsdom'; import React, { act } from 'react'; import { createRoot } from 'react-dom/client';
test('US date changes abort, ignore late responses and distinguish absent history from read failures', async () => {
  const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://test/' });
  const keys = ['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT', 'Element', 'HTMLElement', 'Node'], saved = Object.fromEntries(keys.map(k => [k, globalThis[k]]));
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of ['Element', 'HTMLElement', 'Node']) globalThis[k] = dom.window[k];
  const requests = []; globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve })); let root;
  try {
    const Component = (await vite.ssrLoadModule('/src/components/USThemeValuations.tsx')).default;
    root = createRoot(document.querySelector('#root'));
    const render = async date => act(async () => root.render(React.createElement(Component, { date })));
    const tick = () => act(async () => new Promise(r => setTimeout(r, 170)));
    await render('2026-11-04'); await tick(); await render('2026-11-05'); await tick();
    assert.equal(requests[0].options.signal.aborted, true);
    const row = { name: '半导体', code: 'SOX', date: '2026-11-05', availableDate: '2026-11-05', pb: { value: 12.5, percentile: 25, from: '2026-01-02', through: '2026-11-04', samples: 200 }, ps: { value: null, percentile: null, samples: 0 } };
    await act(async () => requests[1].resolve(Response.json({ data: { date: '2026-11-05', rows: [row, { ...row, code: 'STXWSML', name: '存储', pb: { ...row.pb, value: 765.43, percentile: 99 } }, { ...row, code: 'CPQ', name: '云计算', pb: { value: 12.34, percentile: null, samples: 0 } }] } })));
    assert.equal(document.querySelector('tbody td b').textContent, '25.0%');
    const heldBlank = () => { const trs = [...document.querySelectorAll('tbody tr')], held = trs.find(tr => tr.textContent.includes('STXWSML')); assert.deepEqual([...held.querySelectorAll('td b,td small')].map(e => e.textContent), ['—', '—', '—', '—']); assert.equal(held.querySelectorAll('.valuation-track i').length, 0); assert(trs.find(tr => tr.textContent.includes('CPQ')).textContent.includes('12.34倍')); };
    heldBlank(); assert(requests[1].url.endsWith('&rights=2026-11-10'));
    assert.equal(document.querySelector('tbody td small').textContent, '12.50倍');
    assert.equal(document.querySelector('tbody td .valuation-track i').style.width, '25%');
    await act(async () => requests[0].resolve(Response.json({ data: { date: '2026-11-04', rows: [] } })));
    assert.equal(document.querySelector('tbody td b').textContent, '25.0%');
    assert.ok(document.body.textContent.includes('PB 分位'));
    assert.ok(!document.body.textContent.includes('持仓来源有差异'));
    assert.match(requests[0].url, /\/api\/valuations\/US\/themes\?/);
    await render('2026-11-03'); assert.equal(document.querySelector('tbody td b').textContent, '—'); await tick();
    await act(async () => requests[2].resolve(Response.json({ data: { date: '2026-11-03', rows: [] } })));
    assert.equal(document.querySelector('.valuation-status'), null);
    assert.equal(document.querySelector('table').getAttribute('aria-busy'), 'false');
    await render('2026-11-02'); await tick();
    await act(async () => requests[3].resolve(Response.json({}, { status: 503 })));
    assert.equal(document.querySelector('.valuation-status'), null);
    assert.equal(document.querySelector('tbody td b').textContent, '—');
    await render('2026-11-05'); await tick(); assert.equal(requests.length, 4); assert.equal(document.querySelector('tbody td b').textContent, '25.0%');
    const names = () => [...document.querySelectorAll('tbody th strong')].map(el => el.textContent);
    assert.deepEqual(names(), ['半导体', '存储', '光连接', '数据中心', 'AI 电力基建', '云计算', '云软件', '网络安全', '机器人']);
    const choose = async label => act(async () => [...document.querySelectorAll('.valuation-groups button')].find(el => el.textContent === label).click());
    await choose('传统行业');
    assert.deepEqual(names(), ['银行', '保险', '能源', '公用事业', '必需消费', '可选消费', '医疗保健', '工业', '原材料', '房地产', '金银矿业']);
    assert.equal(document.querySelector('.valuation-status'), null);
    await choose('宽基'); assert.deepEqual(names(), ['标普500', '纳斯达克100']);
    await render('2026-11-03'); await tick(); assert.deepEqual(names(), ['标普500', '纳斯达克100']);
    await choose('AI 板块'); await render('2026-11-05'); await tick();
    assert.equal(document.querySelector('tbody td b').textContent, '25.0%');
    heldBlank(); assert(!document.body.textContent.includes('765.43'));
    assert.equal(requests.length, 4, 'category switches reuse exact-date results without new requests');
  } finally { if (root) await act(async () => root.unmount()); for (const key of keys) globalThis[key] = saved[key]; dom.window.close(); await vite.close(); }
});

test('new renderer masks held rows already present in loaded state, without hiding allowed rows', async () => {
  const selected='2026-09-30',row=(code,name,value)=>({code,name,date:selected,pb:{value,percentile:null,samples:0},ps:{value:null,percentile:null,samples:0}});
  const prior={date:selected,rows:[row('STXWSML','存储',765.43),row('CPQ','云计算',12.34)],error:false,expires:Date.now()+300000};
  let injected=false;
  // Test-only initialization seam: production component code is otherwise unchanged.
  const vite=await createServer({configFile:false,appType:'custom',plugins:[{name:'loaded-state-test-only',enforce:'pre',transform(code,id){if(!id.endsWith('/src/components/USThemeValuations.tsx'))return;const needle='useState<Result | null>(null)';assert(code.includes(needle));injected=true;return code.replace(needle,`useState<Result | null>(${JSON.stringify(prior)})`);}}],server:{middlewareMode:true,hmr:false,ws:false}});
  const dom=new JSDOM('<div id="root"></div>',{url:'https://test/'}),keys=['window','document','fetch','IS_REACT_ACT_ENVIRONMENT','Element','HTMLElement','Node'],saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));let root;
  try{globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;for(const k of ['Element','HTMLElement','Node'])globalThis[k]=dom.window[k];globalThis.fetch=async()=>Response.json({data:{date:selected,rows:prior.rows}});
    const Component=(await vite.ssrLoadModule('/src/components/USThemeValuations.tsx')).default;root=createRoot(document.querySelector('#root'));await act(async()=>root.render(React.createElement(Component,{date:selected})));assert(injected);
    const check=()=>{const rows=[...document.querySelectorAll('tbody tr')],held=rows.find(r=>r.textContent.includes('STXWSML'));assert.deepEqual([...held.querySelectorAll('td b,td small')].map(e=>e.textContent),['—','—','—','—']);assert.equal(held.querySelectorAll('.valuation-track i').length,0);assert(rows.find(r=>r.textContent.includes('CPQ')).textContent.includes('12.34倍'));assert(!document.body.textContent.includes('765.43'));};check();await act(async()=>new Promise(r=>setTimeout(r,180)));check();
  }finally{if(root)await act(async()=>root.unmount());for(const k of keys)globalThis[k]=saved[k];dom.window.close();await vite.close();}
});
