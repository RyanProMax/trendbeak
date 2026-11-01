import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('ordinary service worker leaves quote APIs to the compatible network reader and never navigates an open page', () => { const handlers = {}; let intercepted = false, navigations = 0; runInNewContext(readFileSync('public/service-worker.js', 'utf8'), { self: { location: { origin: 'https://site.test' }, addEventListener: (name, fn) => handlers[name] = fn, clients: { claim: async () => { }, navigate: () => navigations++ } }, URL, Request, Response, Set }); handlers.fetch({ request: new Request('https://site.test/api/markets/US'), respondWith() { intercepted = true; } }); assert.equal(intercepted, false); assert.equal(navigations, 0); });
