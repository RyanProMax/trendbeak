import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const css = readFileSync('src/dashboard-theme.css', 'utf8');
const rgb = value => value.trim().slice(1).match(/../g).map(channel => parseInt(channel, 16));
const luminance = value => rgb(value).map(channel => {
  const s = channel / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
}).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

for (const scheme of ['light', 'dark']) {
  test(`${scheme} retains brand accents on controls and radar without tinting the canvas or benchmark`, () => {
    const dom = new JSDOM(`<html data-theme="${scheme}"><head><style>${css}</style></head></html>`);
    const style = dom.window.getComputedStyle(dom.window.document.documentElement);
    const token = name => style.getPropertyValue(name).trim();
    for (const name of ['--accent', '--data', '--control-thumb', '--range-line']) {
      const channels = rgb(token(name));
      assert.ok(Math.max(...channels) - Math.min(...channels) >= 12, `${name} must not regress to grayscale`);
      assert.ok(channels[1] > channels[0] && channels[1] > channels[2], `${name} retains the sage hue`);
    }
    assert.equal(token('--page'), scheme === 'light' ? '#ffffff' : '#000000');
    assert.equal(new Set(rgb(token('--price-line'))).size, 1, 'benchmark remains neutral');
    assert.match(token('--range-selection'), /^linear-gradient\(/);
    assert.ok(contrast(token('--accent'), token('--control-thumb')) >= 4.5, 'selected market label is legible');
    assert.ok(contrast(token('--data'), token('--page')) >= 4.5, 'radar values are legible');
    dom.window.close();
  });
}

test('theme reveal paints snapshot gutters without an opaque native scrollbar track', () => {
  const scrollbars = readFileSync('src/components/scrollbars.css', 'utf8');
  assert.match(css, /::view-transition-old\(root\)\s*\{[^}]*background:#000000/);
  assert.match(css, /::view-transition-new\(root\)\s*\{[^}]*background:var\(--page\)/);
  assert.match(css, /:root\[data-theme="dark"\]::view-transition-old\(root\)\s*\{[^}]*background:#ffffff/);
  assert.match(scrollbars, /--scrollbar-track:transparent/);
  assert.doesNotMatch(scrollbars, /--scrollbar-track:var\(--page/);
  assert.match(scrollbars, /scrollbar-gutter:stable both-edges/);
  assert.match(scrollbars, /@media\(forced-colors:active\)/);
});
