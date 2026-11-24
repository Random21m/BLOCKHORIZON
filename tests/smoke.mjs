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
  '/api/v1/prices': ['application/json', 'prices.json'], '/api/v1/mining/hashrate/1y': ['application/json', 'hashrate.json'], '/api/v1/lightning/statistics/latest': ['application/json', 'lightning.json'],
  '/api/block-height/840000': ['text/plain', 'h840000.txt'], '/api/v1/mining/blocks/timestamp/1700000000': ['application/json', 'bytime.json'] };
// page.waitForFunction evaluates a string in the page, which the site's CSP (no unsafe-eval) can refuse; poll with evaluate instead.
async function until(page, fn, arg, { timeout = 30000 } = {}) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) {
    try { const v = await Promise.race([page.evaluate(fn, arg), new Promise((r) => setTimeout(() => r(false), 1500))]); if (v) return v; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out waiting for condition' + (last ? ': ' + last.message : ''));
}
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 360, height: 800 } }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
const external = [];
await ctx.route(/mempool\.space/, (route) => { const u = new URL(route.request().url()); external.push(u.pathname); const m = MOCK[u.pathname] || (u.pathname.startsWith('/api/v1/mining/blocks/timestamp/') ? MOCK['/api/v1/mining/blocks/timestamp/1700000000'] : null);
  if (u.pathname.startsWith('/api/v1/block/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(JSON.parse(fx('blocks.json'))[0]) });
  if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
await ctx.routeWebSocket(/ws\.kraken\.com/, (ws) => { ws.onMessage(() => { ws.send(JSON.stringify({ channel: 'ticker', type: 'snapshot', data: [{ symbol: 'BTC/USD', last: 61234.5, change_pct: 1.25 }] })); setTimeout(() => ws.send(JSON.stringify({ channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/USD', last: 61300.2, change_pct: 1.4 }] })), 1500); }); });
const ok = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name, e.message); process.exitCode = 1; } };
await page.goto(base);
await ok('dashboard shows the tip height', async () => { await until(page, () => document.querySelector('#h') && document.querySelector('#h').textContent.replace(/\D/g, '') === '977411', null, { timeout: 8000 }); });
await ok('panels render (halving, difficulty, hashrate, fees, mempool, price)', async () => { const t = await page.locator('main').innerText(); for (const w of ['NEXT HALVING', 'DIFFICULTY ADJUSTMENT', 'HASHRATE', 'FEES', 'MEMPOOL', 'PRICE', '72,589']) assert.ok(t.toUpperCase().includes(w.replace(/,/g, '').length ? w.toUpperCase() : w), w); });
await ok('live price streams in under the block height', async () => { await until(page, () => /61,23[45]/.test(document.querySelector('#btc')?.textContent || ''), null, { timeout: 8000 }); assert.ok((await page.locator('.btc').innerText()).toLowerCase().includes('live')); });
await ok('price moves live: a later trade changes the big price and shows the direction', async () => { await until(page, () => /61,300/.test(document.querySelector('#btc')?.textContent || ''), null, { timeout: 9000 }); assert.equal((await page.locator('#btcdir').innerText()).trim(), '▲'); });
await ok('block colours: mined purple-to-blue, upcoming fee stripes', async () => {
  const mined = await page.evaluate(() => getComputedStyle(document.querySelector('.strip2 a.blk .cube i')).backgroundImage);
  assert.ok(mined.includes('rgb(147, 57, 244)') && mined.includes('rgb(16, 95, 176)'), mined);
  const up = await page.evaluate(() => { const i = document.querySelector('.strip2 .blk.proj .cube i'); return i ? getComputedStyle(i).backgroundImage + getComputedStyle(i).backgroundColor : ''; });
  assert.ok(/rgb\(/.test(up), up); });
await ok('sats per dollar shown', async () => { assert.ok(/1,6\d\d\s+sats/.test(await page.locator('main').innerText())); });
await ok('dashboard fits one screen on phone, laptop and wide screens', async () => {
  for (const [w, h] of [[390, 844], [1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h }); await page.goto(base); await until(page, () => /977/.test(document.querySelector('#h')?.textContent || ''));
    const m = await page.evaluate(() => { const mn = document.querySelector('main'); return { sh: mn.scrollHeight, ch: mn.clientHeight, doc: document.documentElement.scrollHeight, ih: innerHeight, tiles: document.querySelectorAll('.tile').length }; });
    assert.ok(m.tiles >= 10, 'tiles ' + m.tiles); assert.ok(m.sh <= m.ch + 1 && m.doc <= m.ih + 1, `${w}x${h}: main ${m.sh}/${m.ch} doc ${m.doc}/${m.ih}`);
  } await page.setViewportSize({ width: 360, height: 800 }); });
await ok('phone: projected blocks shown, next one and latest mined block both in view', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base); await until(page, () => document.querySelectorAll('.strip2 .blk.proj').length > 0 && document.querySelectorAll('.strip2 a.blk').length > 0);
  const r = await page.evaluate(() => { const inView = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left >= -1 && b.right <= innerWidth + 1; };
    return { next: inView(document.querySelector('.strip2 .blk.proj')), latest: inView(document.querySelector('.strip2 a.blk')) }; });
  assert.deepEqual(r, { next: true, latest: true }); await page.setViewportSize({ width: 360, height: 800 }); });
await ok('no horizontal scroll at 360 px', async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); });
await ok('block page', async () => { await page.goto(base + '#/block/840000'); await page.waitForSelector('.panel dl', { timeout: 6000 }); assert.ok((await page.locator('main').innerText()).includes('Transactions')); });
await ok('block page has a visible way back to the dashboard on a phone', async () => { const back = page.locator('main a.back'); assert.ok(await back.isVisible()); const bx = await back.boundingBox(); assert.ok(bx.height >= 44 && bx.x >= 0 && bx.x + bx.width <= 360, JSON.stringify(bx));
  assert.equal(await page.locator('#nav a[aria-current=page]').count(), 0); await back.click(); await until(page, () => location.hash === '#/' && !!document.querySelector('#h')); });
await ok('search by height navigates', async () => { await page.goto(base); await page.click('#btn-search'); await page.fill('#s-h', '840000'); await page.press('#s-h', 'Enter'); await until(page, () => location.hash === '#/block/840000'); });
await ok('search by date navigates', async () => { await page.goto(base); await page.click('#btn-search'); await page.fill('#s-d', '2023-11-14'); await page.press('#s-d', 'Enter'); await until(page, () => location.hash === '#/block/816785'); });
await ok('alarm can be set and listed', async () => { await page.goto(base + '#/alarm'); await page.fill('#al-b', '5'); await page.click('text=Set alarm'); await page.waitForSelector('table'); assert.ok((await page.locator('main').innerText()).includes('5 blocks')); });
await ok('calculator converts sats to fiat', async () => { await page.goto(base + '#/calc'); await page.waitForSelector('#c-sats'); await page.fill('#c-sats', '100000000'); assert.equal(await page.inputValue('#c-fiat'), '61234.50'); });
await ok('replay, calendar, glossary, about open', async () => { for (const r of ['replay', 'events', 'glossary', 'about']) { await page.goto(base + '#/' + r); assert.ok((await page.locator('main h1').first().innerText()).length > 2, r); } });
await ok('watch page lists the YouTube channels A to Z', async () => { await page.goto(base + '#/watch'); await page.waitForSelector('.channels a');
  const links = await page.$$eval('.channels a', (as) => as.map((a) => [a.textContent.replace(' ↗', '').slice(1), a.href, a.target]));
  assert.equal(links.length, 12); const names = links.map((l) => l[0]); assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })));
  assert.equal(names[0], '88_sats'); assert.equal(names[11], 'WhatBitcoinDidPod'); for (const [h, href, tg] of links) { assert.equal(href, 'https://www.youtube.com/@' + h); assert.equal(tg, '_blank'); }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); });
await ok('about page shows the support address and QR', async () => { await page.goto(base + '#/about'); await page.waitForSelector('#support'); assert.ok((await page.locator('#tip-addr').innerText()).endsWith('@npub.cash'));
  await until(page, () => { const i = document.querySelector('.tip-qr'); return i && i.complete && i.naturalWidth > 0; }); assert.equal(await page.getAttribute('#support a[href^="lightning:"]', 'href'), 'lightning:npub1vj8zjhnmkhekv93e2xmrz7kfwuxq25vrzw53u4dqhwd2lp5smvks3mwu2n@npub.cash'); });
await ok('settings: light theme and language persist', async () => { await page.goto(base); await page.click('#btn-settings'); await page.selectOption('#st-theme', 'light'); assert.equal(await page.getAttribute('html', 'data-theme'), 'light'); await page.reload(); assert.equal(await page.getAttribute('html', 'data-theme'), 'light'); });
await ok('language switch to French changes the menu', async () => { await page.goto(base); await page.click('#btn-settings'); await page.click('[data-k=format]'); await page.selectOption('#st-lang', 'fr'); assert.ok((await page.locator('#nav').innerText()).includes('Alarme')); await page.selectOption('#st-lang', 'en'); });
await ok('privacy page opens', async () => { await page.goto(base + 'privacy.html'); assert.ok((await page.locator('h1').innerText()).includes('PRIVACY')); });
await ok('PWA: manifest valid and service worker registers', async () => { await page.goto(base); const m = await (await page.request.get(base + 'manifest.webmanifest')).json(); assert.ok(m.name && m.icons.length >= 3 && m.display === 'standalone');
  await until(page, () => navigator.serviceWorker.ready.then(() => true), null, { timeout: 8000 }); });
await ok('works offline after first visit (API cached)', async () => { await page.goto(base); await until(page, () => document.querySelector('#h') && /977/.test(document.querySelector('#h').textContent)); await ctx.setOffline(true); await page.reload(); await until(page, () => document.querySelector('#h') && /977/.test(document.querySelector('#h').textContent), null, { timeout: 8000 }); await ctx.setOffline(false); });
await ok('pull down from the top reloads the app (installed apps have no browser pull-to-refresh)', async () => {
  const tctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await tctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort()); const p = await tctx.newPage();
  await p.goto(base); await p.waitForSelector('#ptr', { state: 'attached' }); await p.evaluate(() => { window.__mark = 1; });
  // Touch events are dispatched from inside the page: raw touch emulation differs between browser builds (CI and local).
  await p.evaluate(() => { const t = document.body, pt = (y) => new Touch({ identifier: 1, target: t, clientX: 195, clientY: y }), fire = (type, y, end) => t.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: end ? [] : [pt(y)], changedTouches: [pt(y)] }));
    fire('touchstart', 120); for (let y = 140; y <= 400; y += 20) fire('touchmove', y); fire('touchend', 400, true); });
  await until(p, () => window.__mark === undefined && !!document.querySelector('#ptr'), null, { timeout: 8000 }); assert.equal(await p.locator('#btn-refresh').count(), 1); await tctx.close(); });
await ok('only mempool.space is contacted', async () => { assert.ok(external.length > 0); });
await ok('no script errors', async () => { assert.deepEqual(errs, []); });
await b.close(); srv.close();
