import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
test('wordmark variants preserve identical outlined glyph geometry and versioned delivery',()=>{
 const files=['trendbeak-wordmark.svg','trendbeak-wordmark-dark.svg','trendbeak-wordmark-mono.svg'];
 const geometry=files.map(file=>{const text=readFileSync('public/'+file,'utf8');assert.match(text,/viewBox="4 14 598 115"/);assert.doesNotMatch(text,/<text|<image|font-family/);return [...text.matchAll(/<path\b[^>]* d="([^"]+)"/g)].map(match=>match[1]);});
 assert.equal(geometry[0].length,11);assert.deepEqual(geometry[1],geometry[0]);assert.deepEqual(geometry[2],geometry[0]);
 const app=readFileSync('src/App.tsx','utf8'),worker=readFileSync('public/service-worker.js','utf8');
 for(const name of files.slice(0,2)){assert.ok(app.includes('/'+name+'?v=13'));assert.ok(worker.includes('/'+name+'?v=13'));}
});
