import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// SVGs are the approved, font-independent masters. Rebuild raster deliverables
// with `node scripts/render-brand-assets.mjs` using an installed Chrome.
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
  : ['win32', 'darwin'].includes(process.platform) ? { channel: 'chrome' } : {});
const data = text => 'data:image/svg+xml;base64,' + Buffer.from(text).toString('base64');
const icon = data(await readFile('public/app-icon.svg', 'utf8'));
const small = data(await readFile('public/favicon.svg', 'utf8'));
const wordmark = data(await readFile('public/trendbeak-wordmark.svg', 'utf8'));
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function render(name, width, height, html, background = 'transparent') {
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:${background}}body{display:flex;align-items:center;justify-content:center}img{display:block}</style>${html}`);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
    const bytes = await page.screenshot({ omitBackground: background === 'transparent' });
    if (name) await writeFile('public/' + name, bytes);
    return bytes;
  }
  await render('trendbeak-wordmark.png', 1196, 230, `<img src="${wordmark}" width="1196" height="230">`);
  const icoImages = [];
  for (const size of [16, 32, 48]) icoImages.push(await render(size < 48 ? `favicon-${size}.png` : null, size, size, `<img src="${small}" width="${size}" height="${size}">`));
  const header = Buffer.alloc(6 + 16 * icoImages.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(icoImages.length, 4);
  let offset = header.length;
  icoImages.forEach((bytes, i) => {
    const at = 6 + 16 * i, size = [16, 32, 48][i];
    header[at] = header[at + 1] = size;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(bytes.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += bytes.length;
  });
  await writeFile('public/favicon.ico', Buffer.concat([header, ...icoImages]));
  for (const size of [192, 512]) await render(`app-icon-${size}.png`, size, size, `<img src="${icon}" width="${size}" height="${size}">`);
  await render('app-icon-maskable-512.png', 512, 512, `<img src="${icon}" width="368" height="368">`, '#ffffff');
  await render('apple-touch-icon.png', 180, 180, `<img src="${icon}" width="148" height="148">`, '#ffffff');
  await render('og.png', 1200, 630, `<div style="text-align:center;font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#304a3f"><img src="${wordmark}" width="768" height="148" style="margin:0 auto 50px"><div style="font-size:33px;letter-spacing:5px;font-weight:400">在起伏中，看清趋势。</div><div style="font-size:20px;color:#727d76;letter-spacing:3px;margin-top:22px">A 股与美股的每日市场观察</div></div>`, '#ffffff');
  console.log('Brand PNGs and multi-resolution ICO rendered from approved SVG masters.');
} finally { await browser.close(); }
