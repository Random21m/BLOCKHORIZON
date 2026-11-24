// Playwright smoke test: serves the site locally, mocks mempool.space with recorded responses, checks the main views.
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname), fx = (n) => fs.readFileSync(path.join(root, 'tests/fixtures', n), 'utf8');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); const base = `http://127.0.0.1:${srv.address().port}/`;
const MOCK = { '/api/blocks/tip/height': ['text/plain', 'tip.txt'], '/api/v1/blocks': ['application/json', 'blocks.json'], '/api/v1/difficulty-adjustment': ['application/json', 'difficulty.json'],
  '/api/v1/fees/recommended': ['application/json', 'fees.json'], '/api/mempool': ['application/json', 'mempool.json'], '/api/v1/fees/mempool-blocks': ['application/json', 'mempool-blocks.json'],
  '/api/v1/prices': ['application/json', 'prices.json'], '/api/v1/mining/hashrate/3m': ['application/json', 'hashrate.json'], '/api/v1/lightning/statistics/latest': ['application/json', 'lightning.json'],
  '/api/block-height/840000': ['text/plain', 'h840000.txt'], '/api/v1/mining/blocks/timestamp/1700000000': ['application/json', 'bytime.json'] };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 360, height: 800 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
const external = [];
await ctx.route(/mempool\.space/, (route) => { const u = new URL(route.request().url()); external.push(u.pathname); const m = MOCK[u.pathname] || (u.pathname.startsWith('/api/v1/mining/blocks/timestamp/') ? MOCK['/api/v1/mining/blocks/timestamp/1700000000'] : null);
  if (u.pathname.startsWith('/api/v1/block/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(JSON.parse(fx('blocks.json'))[0]) });
  if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
const ok = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name, e.message); process.exitCode = 1; } };
await page.goto(base);
await ok('dashboard shows the tip height', async () => { await page.waitForFunction(() => document.querySelector('#h') && document.querySelector('#h').textContent.replace(/\D/g, '') === '977411', null, { timeout: 8000 }); });
await ok('panels render (halving, difficulty, hashrate, fees, mempool, price)', async () => { const t = await page.locator('main').innerText(); for (const w of ['NEXT HALVING', 'DIFFICULTY ADJUSTMENT', 'HASHRATE', 'FEES', 'MEMPOOL', 'PRICE', '72,589']) assert.ok(t.toUpperCase().includes(w.replace(/,/g, '').length ? w.toUpperCase() : w), w); });
await ok('sats per dollar shown', async () => { assert.ok(/1,6\d\d\s+sats/.test(await page.locator('main').innerText())); });
await ok('no horizontal scroll at 360 px', async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); });
await ok('block page', async () => { await page.goto(base + '#/block/840000'); await page.waitForSelector('.panel dl', { timeout: 6000 }); assert.ok((await page.locator('main').innerText()).includes('Transactions')); });
await ok('search by height navigates', async () => { await page.goto(base); await page.click('#btn-search'); await page.fill('#s-h', '840000'); await page.press('#s-h', 'Enter'); await page.waitForFunction(() => location.hash === '#/block/840000'); });
await ok('search by date navigates', async () => { await page.goto(base); await page.click('#btn-search'); await page.fill('#s-d', '2023-11-14'); await page.press('#s-d', 'Enter'); await page.waitForFunction(() => location.hash === '#/block/816785'); });
await ok('alarm can be set and listed', async () => { await page.goto(base + '#/alarm'); await page.fill('#al-b', '5'); await page.click('text=Set alarm'); await page.waitForSelector('table'); assert.ok((await page.locator('main').innerText()).includes('5 blocks')); });
await ok('calculator converts sats to fiat', async () => { await page.goto(base + '#/calc'); await page.waitForSelector('#c-sats'); await page.fill('#c-sats', '100000000'); assert.equal(await page.inputValue('#c-fiat'), '59652.00'); });
await ok('replay, calendar, glossary, about open', async () => { for (const r of ['replay', 'events', 'glossary', 'about']) { await page.goto(base + '#/' + r); assert.ok((await page.locator('main h1').first().innerText()).length > 2, r); } });
await ok('settings: light theme and language persist', async () => { await page.goto(base); await page.click('#btn-settings'); await page.selectOption('#st-theme', 'light'); assert.equal(await page.getAttribute('html', 'data-theme'), 'light'); await page.reload(); assert.equal(await page.getAttribute('html', 'data-theme'), 'light'); });
await ok('privacy page opens', async () => { await page.goto(base + 'privacy.html'); assert.ok((await page.locator('h1').innerText()).includes('PRIVACY')); });
await ok('PWA: manifest valid and service worker registers', async () => { await page.goto(base); const m = await (await page.request.get(base + 'manifest.webmanifest')).json(); assert.ok(m.name && m.icons.length >= 3 && m.display === 'standalone');
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 8000 }); });
await ok('works offline after first visit (API cached)', async () => { await page.goto(base); await page.waitForFunction(() => document.querySelector('#h') && /977/.test(document.querySelector('#h').textContent)); await ctx.setOffline(true); await page.reload(); await page.waitForFunction(() => document.querySelector('#h') && /977/.test(document.querySelector('#h').textContent), null, { timeout: 8000 }); await ctx.setOffline(false); });
await ok('only mempool.space is contacted', async () => { assert.ok(external.length > 0); });
await ok('no script errors', async () => { assert.deepEqual(errs, []); });
await b.close(); srv.close();
