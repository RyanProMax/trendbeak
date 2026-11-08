import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('selected search uses a rounded static brand wash with theme and forced-color fallbacks', async () => {
 const css=await readFile(new URL('../src/components/search-state.css',import.meta.url),'utf8');
 assert.match(css,/\.topbar \.search-field\{border-radius:999px\}/);
 assert.match(css,/\.search-field\.has-selection\{[^}]*background:[^;]+;background-image:linear-gradient/);
 assert.match(css,/:root\[data-theme="dark"\] \.topbar \.search-field\.has-selection\{[^}]*linear-gradient/);
 assert.match(css,/\.has-selection input\{color:var\(--ink\)\}/);
 assert.match(css,/\.has-selection:focus-within\{outline:2px solid var\(--focus\)/);
 assert.match(css,/@media\(forced-colors:active\)[\s\S]*background:Canvas/);
 assert.doesNotMatch(css,/(?:animation|transition):/,'static decoration does not animate focus or selection');
});
