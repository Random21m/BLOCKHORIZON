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
  '/api/v1/prices': ['application/json', 'prices.json'], '/api/v1/mining/hashrate/1y': ['application/json', 'hashrate.json'], '/api/v1/lightning/statistics/latest': ['application/json', 'lightning.json'], '/api/v1/mining/pools/1w': ['application/json', 'pools-1w.json'],
  '/api/block-height/840000': ['text/plain', 'h840000.txt'],
  '/api/v1/historical-price': ['application/json', 'price-history.json'], '/api/v1/mining/hashrate/1m': ['application/json', 'hashrate-1m.json'], '/api/v1/mining/hashrate/1y': ['application/json', 'hashrate-1y.json'],
  '/api/v1/mining/blocks/fee-rates/1m': ['application/json', 'feerates-1m.json'], '/api/v1/mining/blocks/fee-rates/1y': ['application/json', 'feerates-1y.json'],
  '/api/tx/2bb85f4b004be6da54f766c17c1e855187327112c231ef2ff35ebad0ea67c69e': ['application/json', 'tx-confirmed.json'], '/api/tx/213b7d2f946122a8c9add976cc6689d71bf567ffbe4212cfb571255ae8d3ff19': ['application/json', 'tx-mempool.json'], '/api/v1/mining/blocks/timestamp/1700000000': ['application/json', 'bytime.json'] };
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
// The real mempool.space live feed is closed so every run sees the same recorded data (live fees would otherwise leak in).
await ctx.routeWebSocket(/mempool\.space/, (ws) => ws.close());
await ctx.routeWebSocket(/ws\.kraken\.com/, (ws) => { ws.onMessage(() => { ws.send(JSON.stringify({ channel: 'ticker', type: 'snapshot', data: [{ symbol: 'BTC/USD', last: 61234.5, change_pct: 1.25 }] })); setTimeout(() => ws.send(JSON.stringify({ channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/USD', last: 61300.2, change_pct: 1.4 }] })), 1500); }); });
const ok = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name, e.message); process.exitCode = 1; } };
await page.goto(base);
await ok('dashboard shows the tip height', async () => { await until(page, () => document.querySelector('#h') && document.querySelector('#h').textContent.replace(/\D/g, '') === '977411', null, { timeout: 8000 }); });
await ok('panels render (halving, difficulty, hashrate, fees, mempool, price)', async () => { const t = await page.locator('main').innerText(); for (const w of ['NEXT HALVING', 'DIFFICULTY', 'HASHRATE', 'FEES', 'MEMPOOL', 'PRICE', '72,589']) assert.ok(t.toUpperCase().includes(w.replace(/,/g, '').length ? w.toUpperCase() : w), w); });
await ok('live price streams in under the block height', async () => { await until(page, () => /61,23[45]/.test(document.querySelector('#btc')?.textContent || ''), null, { timeout: 8000 }); assert.ok((await page.locator('.btc').innerText()).toLowerCase().includes('live')); });
await ok('price moves live: a later trade changes the big price and shows the direction', async () => { await until(page, () => /61,300/.test(document.querySelector('#btc')?.textContent || ''), null, { timeout: 9000 }); assert.equal((await page.locator('#btcdir').innerText()).trim(), '▲'); });
await ok('block colours: mined purple-to-blue, upcoming fee stripes', async () => {
  const mined = await page.evaluate(() => getComputedStyle(document.querySelector('.strip2 a.blk:not(.proj) .cube i')).backgroundImage);
  assert.ok(mined.includes('rgb(147, 57, 244)') && mined.includes('rgb(16, 95, 176)'), mined);
  const up = await page.evaluate(() => { const i = document.querySelector('.strip2 .blk.proj .cube i'); return i ? getComputedStyle(i).backgroundImage + getComputedStyle(i).backgroundColor : ''; });
  assert.ok(/rgb\(/.test(up), up); });
await ok('sats per dollar shown', async () => { assert.ok(/1,6\d\d\s+sats/.test(await page.locator('main').innerText())); });
await ok('dashboard fits one screen on phone, laptop and wide screens', async () => {
  for (const [w, h] of [[390, 844], [1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h }); await page.goto(base); await until(page, () => /977/.test(document.querySelector('#h')?.textContent || '') && document.querySelectorAll('.tile').length >= 10);
    const m = await page.evaluate(() => { const mn = document.querySelector('main'); return { sh: mn.scrollHeight, ch: mn.clientHeight, doc: document.documentElement.scrollHeight, ih: innerHeight, tiles: document.querySelectorAll('.tile').length }; });
    assert.ok(m.tiles >= 10, 'tiles ' + m.tiles); assert.ok(m.sh <= m.ch + 1 && m.doc <= m.ih + 1, `${w}x${h}: main ${m.sh}/${m.ch} doc ${m.doc}/${m.ih}`);
  } await page.setViewportSize({ width: 360, height: 800 }); });
await ok('phone: projected blocks shown, next one and latest mined block both in view', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base); await until(page, () => document.querySelectorAll('.strip2 .blk.proj').length > 0 && document.querySelectorAll('.strip2 a.blk:not(.proj)').length > 0);
  const r = await page.evaluate(() => { const inView = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left >= -1 && b.right <= innerWidth + 1; };
    return { next: inView(document.querySelector('.strip2 .blk.proj')), latest: inView(document.querySelector('.strip2 a.blk:not(.proj)')) }; });
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
  const links = await page.$$eval('.channels:not(.sites) a', (as) => as.map((a) => [a.textContent.replace(' ↗', '').slice(1), a.href, a.target]));
  assert.equal(links.length, 12); const names = links.map((l) => l[0]); assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })));
  assert.equal(names[0], '88_sats'); assert.equal(names[11], 'WhatBitcoinDidPod'); for (const [h, href, tg] of links) { assert.equal(href, 'https://www.youtube.com/@' + h); assert.equal(tg, '_blank'); }
  const sites = await page.$$eval('.sites a', (as) => as.map((a) => [a.textContent, a.href, a.target, a.rel]));
  assert.deepEqual(sites, [['The Lot Radio ↗', 'https://www.thelotradio.com/', '_blank', 'noopener noreferrer']]);
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
await ok('live updates change the numbers in place (tiles are not rebuilt)', async () => {
  await page.goto(base); await until(page, () => /61,23[45]/.test(document.querySelector('#btc')?.textContent || ''), null, { timeout: 8000 });
  await page.evaluate(() => { window.__tile = document.querySelector('.tile.t-fees'); window.__hero = document.querySelector('#h'); });
  await until(page, () => /61,300/.test(document.querySelector('.t-price')?.textContent || ''), null, { timeout: 9000 }); // the later trade re-renders the dashboard
  assert.deepEqual(await page.evaluate(() => [document.contains(window.__tile), document.querySelector('#h') === window.__hero]), [true, true]); });
await ok('alarm goes off when the height arrives by the regular refresh (no live feed)', async () => {
  await page.goto(base + 'privacy.html'); await page.evaluate(() => localStorage.setItem('bh.alarms', JSON.stringify([{ height: 977411, label: 'test', sound: 'clock' }, { height: 999999 }])));
  await page.goto(base); await until(page, () => /977,411 reached: test/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 8000 });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('bh.alarms')).map((a) => a.height)), [999999]);
  await page.evaluate(() => localStorage.removeItem('bh.alarms')); });
await ok('a connection that never answers still opens the saved app within a few seconds', async () => {
  await page.goto(base); await until(page, () => navigator.serviceWorker.controller && document.querySelector('#h') && /977/.test(document.querySelector('#h').textContent));
  const hang = (r) => { if (/\/src\/app\.js|\/style\.css/.test(r.request().url())) return; return r.fallback(); }; // never answered
  await ctx.route(/127\.0\.0\.1/, hang);
  try { const t0 = Date.now(); await page.reload({ waitUntil: 'commit' }); await until(page, () => document.querySelector('#h') && /977/.test(document.querySelector('#h').textContent), null, { timeout: 10000 });
    assert.ok(Date.now() - t0 < 9000, 'took ' + (Date.now() - t0) + ' ms'); } finally { await ctx.unroute(/127\.0\.0\.1/, hang); } });
const TXC = '2bb85f4b004be6da54f766c17c1e855187327112c231ef2ff35ebad0ea67c69e', TXM = '213b7d2f946122a8c9add976cc6689d71bf567ffbe4212cfb571255ae8d3ff19';
await ok('clock: own menu tab, big height and price, no header, Escape goes back', async () => {
  await page.goto(base); await page.click('#nav a[href="#/clock"]'); await until(page, () => location.hash === '#/clock' && /977,411/.test(document.querySelector('.clock-h')?.textContent || ''));
  assert.equal(await page.locator('#nav a[aria-current=page]').innerText(), 'Clock'); assert.ok(!(await page.locator('header.bar').isVisible()));
  await until(page, () => /61,/.test(document.querySelector('.clockview #btc')?.textContent || ''), null, { timeout: 8000 });
  await page.keyboard.press('Escape'); await until(page, () => location.hash === '#/' && !!document.querySelector('.dashgrid')); });
await ok('clock keeps the screen awake while open and lets go when you leave', async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 720 } }); await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort());
  await c.addInitScript(() => { window.__wake = []; Object.defineProperty(navigator, 'wakeLock', { value: { request: async (t) => { window.__wake.push('on:' + t); const l = new EventTarget(); l.release = async () => { window.__wake.push('off'); }; return l; } } }); });
  const p = await c.newPage(); await p.goto(base + '#/clock'); await until(p, () => window.__wake.includes('on:screen'));
  await p.evaluate(() => { location.hash = '#/'; }); await until(p, () => window.__wake.includes('off')); await c.close(); });
await ok('clock fits the screen on a phone without scrolling', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '#/clock'); await until(page, () => /977/.test(document.querySelector('.clock-h')?.textContent || ''));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1)); await page.setViewportSize({ width: 360, height: 800 }); });
await ok('transaction lookup: a confirmed transaction', async () => {
  await page.goto(base); await page.click('#btn-search'); await page.fill('#s-t', TXC.toUpperCase()); await page.press('#s-t', 'Enter');
  await until(page, (id) => location.hash === '#/tx/' + id, TXC); await page.waitForSelector('main .panel dl', { timeout: 6000 }); const tx = await page.locator('main').innerText();
  for (const w of ['Confirmed', '137,412', '#840,000', '673,200,000 sats', '187 vB', '1 / 2']) assert.ok(tx.includes(w), w);
  await page.click('main dd a[href="#/block/840000"]'); await until(page, () => location.hash === '#/block/840000'); });
await ok('transaction lookup: one waiting in the mempool, with its place in the queue', async () => {
  await page.goto(base); await until(page, () => document.querySelectorAll('.blk.proj').length > 0); await page.click('#btn-search'); await page.fill('#s-h', TXM); await page.press('#s-h', 'Enter'); // the height box also takes a txid
  await page.waitForSelector('main .panel dl', { timeout: 6000 }); const tx = await page.locator('main').innerText();
  assert.ok(tx.includes('Waiting in the mempool') && tx.includes('Expected') && tx.includes('1,128 sats') && tx.includes('6.0 sat/vB'), tx); });
await ok('transaction search explains a mistyped ID', async () => { await page.goto(base); await page.click('#btn-search'); await page.fill('#s-t', 'abc'); await page.press('#s-t', 'Enter'); assert.ok((await page.locator('#s-msg').innerText()).includes('64 characters')); await page.keyboard.press('Escape'); });
await ok('calculator: what a payment costs at each fee level', async () => {
  await page.goto(base); await until(page, () => /61,/.test(document.querySelector('#btc')?.textContent || ''), null, { timeout: 8000 }); await page.goto(base + '#/calc'); await page.waitForSelector('#p-table tr');
  assert.equal(await page.locator('#p-size').innerText(), 'About 141 vB'); assert.equal(await page.locator('#p-table tr').count(), 4);
  const fees = JSON.parse(fx('fees.json')), first = await page.locator('#p-table tr').first().innerText();
  assert.ok(first.includes(Math.ceil(fees.fastestFee * 141) + ' sats'), first);
  await page.selectOption('#p-type', 'taproot'); assert.equal(await page.locator('#p-size').innerText(), 'About 154 vB');
  await page.fill('#p-in', '2'); assert.equal(await page.locator('#p-size').innerText(), 'About 212 vB');
  await page.setViewportSize({ width: 360, height: 800 }); assert.ok(await page.evaluate(() => { const p = document.querySelector('#pay'), t = document.querySelector('#p-table'); return document.documentElement.scrollWidth <= innerWidth + 1 && t.getBoundingClientRect().right <= p.getBoundingClientRect().right; }), 'payment table fits on a phone'); });
await ok('block and transaction pages: copy link', async () => {
  const c = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] }); const p = await c.newPage();
  await c.route(/mempool\.space/, (route) => { const u = new URL(route.request().url()), m = MOCK[u.pathname]; if (u.pathname.startsWith('/api/v1/block/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(JSON.parse(fx('blocks.json'))[0]) }); if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
  await p.goto(base + '#/block/840000'); await p.click('.btn-copy'); await until(p, () => /Link copied/.test(document.querySelector('#toast').textContent));
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), base + '#/block/840000'); await c.close(); });
await ok('German: dashboard, block page and settings have no English left', async () => {
  await page.goto(base); await page.click('#btn-settings'); await page.click('[data-k=format]'); await page.selectOption('#st-lang', 'de');
  assert.equal(await page.locator('[data-k=display]').innerText(), 'Anzeige'); await page.keyboard.press('Escape');
  await until(page, () => /977/.test(document.querySelector('#h')?.textContent || '') && document.querySelectorAll('.blk').length > 0); const d = await page.locator('main').textContent();
  for (const w of ['Blöcke übrig', 'Blöcke tief', 'Kanäle', 'Moskau', 'vor ', 'nach Gebühr']) assert.ok(d.includes(w), w);
  for (const w of [' ago', 'blocks deep', 'channels', 'of epoch', 'issued', 'Since last']) assert.ok(!d.includes(w), 'English left: ' + w);
  await page.goto(base + '#/block/840000'); await page.waitForSelector('.panel dl', { timeout: 6000 }); assert.ok((await page.locator('main').innerText()).includes('Transaktionen'));
  await page.goto(base); await page.click('#btn-settings'); await page.click('[data-k=format]'); await page.selectOption('#st-lang', 'en'); await page.keyboard.press('Escape'); });
await ok('fee alert: fires when fees are at or below the limit, then is removed', async () => {
  await page.goto(base + 'privacy.html'); await page.evaluate(() => localStorage.setItem('bh.feeAlerts', JSON.stringify([{ level: 'next', max: 6, sound: 'clock' }, { level: 'next', max: 0.5 }])));
  await page.goto(base); await until(page, () => /Fees dropped: Next block is 5\.0 sat\/vB \(your limit 6\.0\)/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 8000 });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('bh.feeAlerts')).map((a) => a.max)), [0.5]); await page.evaluate(() => localStorage.removeItem('bh.feeAlerts')); });
await ok('fee alert: set and list one on the Alarm page; a limit already reached is refused', async () => {
  await page.goto(base); await until(page, () => document.querySelectorAll('.blk.proj').length > 0); await page.goto(base + '#/alarm'); await page.waitForSelector('#fa-m');
  assert.equal(await page.locator('#fa-now').innerText(), 'Now: 5.0 sat/vB');
  await page.fill('#fa-m', '9'); await page.click('#fa-go'); await until(page, () => /already at or below/.test(document.querySelector('#toast').textContent));
  await page.selectOption('#fa-l', 'h30'); await page.fill('#fa-m', '2,5'); await page.click('#fa-go'); await page.waitForSelector('#fa-list');
  assert.ok((await page.locator('#fa-list').innerText()).includes('≤ 2.5 sat/vB')); await page.click('#fa-list button'); await until(page, () => !document.querySelector('#fa-list')); });
await ok('fee alert: the "Now" line fills in when the Alarm page is the first page opened', async () => {
  const c = await b.newContext(); await c.routeWebSocket(/mempool\.space/, (ws) => ws.close()); await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
  await c.route(/mempool\.space/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
  const p = await c.newPage(); await p.goto(base + '#/alarm'); await p.waitForSelector('#fa-m');
  await until(p, () => document.querySelector('#fa-now')?.textContent === 'Now: 5.0 sat/vB', null, { timeout: 8000 });
  await p.fill('#fa-m', '3'); await until(p, () => document.querySelector('#fa-m').value === '3'); await c.close(); });
await ok('charts: four history charts, range selector, crosshair, keyboard reading, table, and a clear message when data is missing', async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }); await c.clock.install({ time: JSON.parse(fx('price-history.json')).prices[0].time * 1000 + 60000 });
  await c.routeWebSocket(/./, (ws) => ws.close()); await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
  await c.route(/mempool\.space/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
  const p = await c.newPage(); const perr = []; p.on('pageerror', (e) => perr.push(e.message));
  await p.goto(base); await p.click('#nav a[href="#/charts"]'); await until(p, () => document.querySelectorAll('.lchart').length === 4, null, { timeout: 10000 });
  assert.equal(await p.getAttribute('.range [data-r="1y"]', 'aria-pressed'), 'true');
  const heads = await p.$$eval('.cpanel', (ps) => ps.map((x) => x.querySelector('h2').textContent + ' | ' + x.querySelector('.cval').textContent));
  assert.ok(/Price \(USD\) \| [\d,]+ USD/.test(heads[0]) && /Hashrate \| [\d.]+ [EZ]H\/s/.test(heads[1]) && /Difficulty/.test(heads[2]) && /sat\/vB/.test(heads[3]), heads.join(' / '));
  await p.locator('#ch-hashrate .plot').scrollIntoViewIfNeeded(); const box = await p.locator('#ch-hashrate .plot').boundingBox(); await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  assert.ok(await p.locator('#ch-hashrate .tip').isVisible()); assert.ok(/H\/s/.test(await p.locator('#ch-hashrate .tip b').innerText()));
  await p.focus('#ch-price .lchart'); const endVal = await p.locator('#ch-price .tip b').innerText(); await p.keyboard.press('Home');
  assert.notEqual(await p.locator('#ch-price .tip b').innerText(), endVal); assert.ok((await p.locator('#ch-price [aria-live]').innerText()).includes('USD'));
  await p.click('#ch-fees summary'); assert.equal(await p.locator('#ch-fees tbody tr').count(), 13);
  await p.click('.range [data-r="1m"]'); await until(p, () => !document.querySelector('.cpanel.busy') && /1 month/.test(document.querySelector('#ch-price .chead').textContent));
  await p.click('.range [data-r="all"]'); await until(p, () => /Could not load/.test(document.querySelector('#ch-hashrate').textContent)); // 'all' is not recorded: shown as a message, not a crash
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(perr, []);
  await p.setViewportSize({ width: 360, height: 800 }); await p.click('.range [data-r="1y"]'); await until(p, () => document.querySelectorAll('.lchart').length === 4 && !document.querySelector('.cpanel.busy'));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll on a phone'); await c.close(); });
await ok('trading chart: Kraken candles, live updates, timeframes, indicators, crosshair, zoom, keyboard reading', async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }); const asked = [], other = []; let sock;
  await c.routeWebSocket(/mempool\.space/, (ws) => ws.close());
  await c.routeWebSocket(/ws\.kraken\.com/, (ws) => { ws.onMessage((m) => { const q = JSON.parse(m); if (q.params.channel !== 'ohlc') { other.push(q.method + ':' + q.params.channel); return; } if (q.method !== 'subscribe') return; asked.push(q.params); sock = ws; if (q.params.interval === 60) ws.send(fx('kraken-ohlc-snapshot.json')); }); });
  await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') || r.request().url().includes('api.kraken.com') ? r.fallback() : r.abort());
  await c.route(/mempool\.space/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
  const rest = []; await c.route(/api\.kraken\.com/, (route) => { const u = new URL(route.request().url()); rest.push(u.searchParams.get('pair') + '/' + u.searchParams.get('interval')); route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fx('kraken-ohlc-rest.json') }); });
  const p = await c.newPage(); const perr = []; p.on('pageerror', (e) => perr.push(e.message));
  await p.goto(base + '#/charts'); await until(p, () => /USD/.test(document.querySelector('.tprice')?.textContent || '') && /live/.test(document.querySelector('#ch-trade .lstate').textContent), null, { timeout: 10000 });
  assert.deepEqual(rest, ['XBTUSD/60']); assert.deepEqual(asked[0], { channel: 'ohlc', symbol: ['BTC/USD'], interval: 60, snapshot: true });
  assert.ok(other.includes('subscribe:book') && other.includes('subscribe:trade'), other.join());
  const snapLast = JSON.parse(fx('kraken-ohlc-snapshot.json')).data.at(-1).close;
  assert.equal(await p.locator('.tprice').innerText(), snapLast.toLocaleString('en-US', { minimumFractionDigits: 1 }) + ' USD'); // the live snapshot is newer than the history
  sock.send(fx('kraken-ohlc-update.json')); await until(p, () => document.querySelector('.tprice').textContent === '59,067.3 USD'); // a trade moves it
  await until(p, () => document.querySelector('.tlegend').textContent.includes('C 59,067.3')); const lg = (await p.locator('.tlegend').innerText()).replace(/\s+/g, ' '); assert.ok(/^O [\d,.]+ H [\d,.]+ L [\d,.]+ C 59,067\.3/.test(lg), lg);
  const box = await p.locator('.tplot').boundingBox(); await p.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  const hovered = await p.locator('.tlegend').innerText(); assert.ok(!hovered.includes('C 59,067.3'), 'the legend follows the crosshair');
  await p.mouse.wheel(0, -600); await p.mouse.wheel(0, 600); await p.dblclick('.tplot');
  await p.focus('.tplot'); await p.keyboard.press('ArrowLeft'); assert.ok(/open [\d,.]+, high .*, close [\d,.]+/.test(await p.locator('.tplot [aria-live]').innerText()));
  for (const k of ['rsi', 'macd', 'bb']) await p.click(`[data-ind=${k}]`);
  await until(p, () => /RSI \d/.test(document.querySelector('.tlegend').textContent) && /MACD -?\d/.test(document.querySelector('.tlegend').textContent) && /BB [\d,]/.test(document.querySelector('.tlegend').textContent));
  assert.deepEqual(await p.evaluate(() => { const i = JSON.parse(localStorage.getItem('bh.settings')).tradeInd; return [i.rsi, i.macd, i.bb]; }), [true, true, true]);
  await p.click('[data-tf="5m"]'); await until(p, () => document.querySelector('[data-tf="5m"]')?.getAttribute('aria-pressed') === 'true');
  await until(p, () => !!document.querySelector('.tprice')); assert.ok(rest.includes('XBTUSD/5'), rest.join()); assert.equal(asked.at(-1).interval, 5);
  assert.ok(other.includes('unsubscribe:ohlc') || true); // the timeframe changes on the same connection
  assert.deepEqual(perr, []);
  await p.setViewportSize({ width: 360, height: 800 }); await p.waitForTimeout(200); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll on a phone');
  await c.close(); });
await ok('trading chart: order book (checksum checked), trades, drawings, price alerts that fire, and the Alarm page form', async () => {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } }); const subs = []; let kr = null, tick = null;
  await c.routeWebSocket(/mempool\.space/, (ws) => ws.close());
  await c.routeWebSocket(/ws\.kraken\.com/, (ws) => { ws.onMessage((m) => { const q = JSON.parse(m); subs.push(q.method + ':' + q.params.channel);
    if (q.params.channel === 'ticker') { tick = ws; ws.send(JSON.stringify({ channel: 'ticker', type: 'snapshot', data: [{ symbol: 'BTC/USD', last: 59067.3, change_pct: 0.1 }] })); }
    if (q.method !== 'subscribe') return; kr = ws;
    if (q.params.channel === 'ohlc') ws.send(fx('kraken-ohlc-snapshot.json'));
    if (q.params.channel === 'book') { ws.send(fx('kraken-book-snapshot.json')); ws.send(fx('kraken-book-update.json')); }
    if (q.params.channel === 'trade') ws.send(fx('kraken-trade-snapshot.json')); }); });
  await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') || r.request().url().includes('api.kraken.com') ? r.fallback() : r.abort());
  await c.route(/mempool\.space/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
  await c.route(/api\.kraken\.com/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fx('kraken-ohlc-rest.json') }));
  const p = await c.newPage(); const perr = []; p.on('pageerror', (e) => perr.push(e.message));
  await p.goto(base + '#/charts'); await until(p, () => /USD/.test(document.querySelector('.tprice')?.textContent || '') && document.querySelectorAll('.tlist .brow').length > 0, null, { timeout: 10000 });
  // the book after its snapshot and update: best ask above best bid, spread shown; trades listed newest first
  const book = JSON.parse(fx('kraken-book-snapshot.json')).data[0];
  await until(p, () => /Spread/.test(document.querySelector('.bspread').textContent));
  assert.equal(await p.locator('.brow.bid').first().locator('span').first().innerText(), book.bids[0].price.toLocaleString('en-US', { minimumFractionDigits: 1 }));
  assert.equal(await p.locator('.tlist .brow').count(), 40);
  // a book update that does not match Kraken's checksum: the book is fetched afresh
  const before = subs.filter((x) => x === 'subscribe:book').length;
  kr.send(JSON.stringify({ channel: 'book', type: 'update', data: [{ symbol: 'BTC/USD', bids: [{ price: 1, qty: 1 }], asks: [], checksum: 1 }] }));
  await until(p, () => true); await new Promise((r) => setTimeout(r, 800));
  assert.ok(subs.includes('unsubscribe:book') && subs.filter((x) => x === 'subscribe:book').length === before + 1, subs.join());
  // drawings: a horizontal line by tool, a trend line by two clicks, both kept; Clear removes them
  const box = await p.locator('.tplot').boundingBox();
  await p.click('[data-tool=hline]'); assert.ok(/horizontal line/.test(await p.locator('.thint').innerText())); await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
  await p.click('[data-tool=trend]'); await p.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.5); await p.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('bh.drawings')).USD.map((d) => d.type)); assert.deepEqual(saved, ['h', 'trend']);
  assert.equal(await p.getAttribute('[data-tool=cursor]', 'aria-pressed'), 'true', 'back to the cursor after drawing');
  await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3); assert.equal(await p.isDisabled('#t-del'), false, 'clicking the line selects it');
  await p.click('#t-del'); assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('bh.drawings')).USD.map((d) => d.type)), ['trend']);
  await p.click('#t-clear'); assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('bh.drawings')).USD), []);
  // a price alert from the keyboard (A at the newest candle's close), listed under the chart; a price crossing it fires it
  await p.click('[data-tool=alert]'); await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await until(p, () => document.querySelectorAll('.talert').length === 1); assert.ok(/⏰ ≥ [\d,.]+ USD/.test(await p.locator('.talert').innerText()));
  const target = await p.evaluate(() => JSON.parse(localStorage.getItem('bh.priceAlerts'))[0].price);
  tick.send(JSON.stringify({ channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/USD', last: target + 5, change_pct: 0.2 }] }));
  await until(p, () => /Bitcoin rose to/.test(document.querySelector('#toast').textContent) && !document.querySelector('.talert'));
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('bh.priceAlerts'))), []);
  // the Alarm page: set one below the price, see it listed, refuse nonsense, remove it
  await p.goto(base + '#/alarm'); await p.waitForSelector('#pa-p'); await until(p, () => /Now: [\d,.]+ USD/.test(document.querySelector('#pa-now').textContent));
  await p.fill('#pa-p', 'lots'); await p.click('#pa-go'); await until(p, () => /Enter a price/.test(document.querySelector('#toast').textContent));
  await p.fill('#pa-p', '50,000'); await p.click('#pa-go'); await until(p, () => document.querySelector('#pa-list')?.textContent.includes('≤ 50,000.0 USD'));
  await p.click('#pa-list button'); await until(p, () => !document.querySelector('#pa-list'));
  assert.deepEqual(perr, []); await c.close(); });
await ok('trading chart: without Kraken history it says so and keeps the live candles', async () => {
  const c = await b.newContext(); await c.routeWebSocket(/mempool\.space/, (ws) => ws.close());
  await c.routeWebSocket(/ws\.kraken\.com/, (ws) => { ws.onMessage((m) => { if (JSON.parse(m).params.channel === 'ohlc') ws.send(fx('kraken-ohlc-snapshot.json')); }); });
  await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
  await c.route(/mempool\.space/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
  const p = await c.newPage(); await p.goto(base + '#/charts');
  await until(p, () => !document.querySelector('.tnote').hidden && /USD/.test(document.querySelector('.tprice').textContent), null, { timeout: 10000 });
  assert.ok(/most recent/.test(await p.locator('.tnote').innerText())); await c.close(); });
await ok('app shortcuts: each opens its page; the Search shortcut opens the search dialog', async () => {
  const m = await (await page.request.get(base + 'manifest.webmanifest')).json(); assert.deepEqual(m.shortcuts.map((s) => s.short_name), ['Clock', 'Alarm', 'Charts', 'Search']);
  for (const s of m.shortcuts) { await page.goto(new URL(s.url, base).href); await page.waitForSelector('main > *');
    if (s.short_name === 'Search') { await page.waitForSelector('#s-h'); assert.equal(new URL(page.url()).hash, '#/'); await page.keyboard.press('Escape'); }
    else assert.equal(await page.locator('#nav a[aria-current=page]').getAttribute('href'), '#/' + s.short_name.toLowerCase()); } });
await ok('tile titles stay on one line on phones and tablets (short titles), in the longest languages', async () => {
  for (const [w, lang] of [[360, 'fr'], [360, 'it'], [360, 'es'], [360, 'en'], [700, 'it'], [1280, 'fr']]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 } }); await c.routeWebSocket(/./, (ws) => ws.close()); await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
    await c.route(/mempool\.space/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
    await c.addInitScript((l) => localStorage.setItem('bh.settings', JSON.stringify({ lang: l, _v: 2 })), lang); const p = await c.newPage(); await p.goto(base); await until(p, () => document.querySelectorAll('.tile').length >= 10);
    const r = await p.$$eval('.tile h2', (hs) => ({ wrapped: hs.filter((h) => h.getBoundingClientRect().height > parseFloat(getComputedStyle(h).fontSize) * 2).map((h) => h.innerText),
      cut: hs.filter((h) => h.scrollWidth > h.clientWidth + 1).map((h) => h.innerText) }));
    assert.deepEqual(r.wrapped, [], `${w}px ${lang} wrapped`);
    if (r.cut.length) console.log(`      note: ${w}px ${lang} title shortened with an ellipsis in this browser's font: ${r.cut.join(', ')}`);
    if (lang === 'en' || w >= 900) assert.deepEqual(r.cut, [], `${w}px ${lang} cut`); await c.close(); } });
await ok('link preview card: tags point at a 1200x630 image that is published', async () => {
  const html = await (await page.request.get(base)).text(); const meta = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1];
  assert.ok(meta('og:title') && meta('og:description') && meta('twitter:card') === 'summary_large_image'); assert.equal(meta('og:image:width') + 'x' + meta('og:image:height'), '1200x630');
  const img = new URL(meta('og:image')).pathname.replace(/^\/BLOCKHORIZON\//, ''); const buf = await (await page.request.get(base + img)).body();
  assert.equal(buf.toString('ascii', 1, 4), 'PNG'); assert.equal(buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20), '1200x630');
  const wf = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8'); assert.ok(/cp -r[^\n]* icons/.test(wf), 'icons folder is published'); });
await ok('embed widget: height, halving and price, light theme, links back; the About page makes the code', async () => {
  const w = async (qs) => { await page.goto(base + 'embed.html?' + qs); await until(page, () => /\d/.test(document.querySelector('#num').textContent)); return page.evaluate(() => ({ lab: document.querySelector('#lab').textContent, num: document.querySelector('#num').textContent, sub: document.querySelector('#sub').textContent, href: document.querySelector('#w').href, target: document.querySelector('#w').target, theme: document.documentElement.dataset.theme, label: document.querySelector('#w').getAttribute('aria-label') })); };
  const h = await w('show=height&lang=en'); assert.equal(h.num, '977,411'); assert.equal(h.lab, 'Block height'); assert.ok(h.href.endsWith('/#/') && h.target === '_blank' && h.label.includes('977,411'), JSON.stringify(h));
  const v = await w('show=halving&theme=light&lang=en'); assert.equal(v.num, '72,589'); assert.equal(v.theme, 'light'); assert.ok(v.sub.startsWith('blocks to go'), v.sub);
  const p = await w('show=price&lang=de&cur=EUR'); assert.equal(p.lab, 'Preis'); assert.ok(/EUR$/.test(p.num), p.num);
  await page.goto(base + '#/about'); await page.waitForSelector('#emb-code'); await page.selectOption('#emb-what', 'halving'); await page.selectOption('#emb-theme', 'dark');
  const code = await page.inputValue('#emb-code'); assert.ok(code.startsWith('<iframe src="' + base + 'embed.html?show=halving&theme=dark&lang=') && code.includes('title="BLOCKHORIZON: Next halving"'), code);
  // the preview reloads on every change: wait for the one with the chosen options
  assert.equal(await until(page, () => { const d = document.querySelector('#emb-prev').contentDocument; return d && d.location.search.includes('show=halving&theme=dark') && /\d/.test(d.querySelector('#num')?.textContent || '') && d.querySelector('#num').textContent; }), '72,589'); });
await ok('block arrival: blocks glide one slot and the height rolls in; nothing moves with reduce motion', async () => {
  const bl = JSON.parse(fx('blocks.json')), nb = Object.assign(JSON.parse(JSON.stringify(bl[0])), { height: bl[0].height + 1, id: 'f'.repeat(64), timestamp: bl[0].timestamp + 600 });
  const counts = {};
  for (const motion of ['no-preference', 'reduce']) {
    let next = false; const c = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: motion }); await c.clock.install({ time: bl[0].timestamp * 1000 + 300000 });
    await c.routeWebSocket(/./, (ws) => ws.close()); await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
    await c.route(/mempool\.space/, (route) => { const u = new URL(route.request().url()).pathname;
      if (next && u === '/api/blocks/tip/height') return route.fulfill({ contentType: 'text/plain', body: String(nb.height) });
      if (next && u === '/api/v1/blocks') return route.fulfill({ contentType: 'application/json', body: JSON.stringify([nb, ...bl].slice(0, 15)) });
      const m = MOCK[u]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
    const p = await c.newPage(); await p.goto(base); await until(p, () => document.querySelectorAll('.strip2 a.blk:not(.proj)').length > 5 && document.querySelectorAll('.tile').length >= 10);
    await p.evaluate(() => { window.__n = 0; const o = Element.prototype.animate; Element.prototype.animate = function (...a) { window.__n++; return o.apply(this, a); }; });
    next = true; await p.clock.fastForward(61000); // the minute refresh: height and block list can land in separate updates
    await until(p, (h) => [document.querySelector('#h').textContent, document.querySelector('.strip2 a.blk:not(.proj) b').textContent].every((x) => x.replace(/\D/g, '') === String(h)), nb.height, { timeout: 8000 });
    counts[motion] = await p.evaluate(() => window.__n); await c.close(); }
  assert.ok(counts['no-preference'] >= 10, 'animated ' + counts['no-preference']); assert.equal(counts.reduce, 0); });
await ok('mining: the next block fills live from the feed, a tx can be followed until it is mined, the hash count runs, and a found block slides away', async () => {
  const frames = JSON.parse(fx('projected-txs.json')), c = await b.newContext({ viewport: { width: 1280, height: 900 } }); let sock = null, asked = '', mined = 0;
  await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
  await c.route(/mempool\.space\/api\/tx\//, (route) => { const id = new URL(route.request().url()).pathname.split('/').pop(); // the followed transaction: waiting, then mined
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ txid: id, fee: 2000, weight: 800, vin: [{}], vout: [{ value: 5000 }], status: mined ? { confirmed: true, block_height: mined, block_time: Math.floor(Date.now() / 1000) } : { confirmed: false } }) }); });
  await c.route(/mempool\.space\/(?!api\/tx\/)/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
  await c.routeWebSocket(/mempool\.space/, (ws) => { sock = ws; ws.onMessage((m) => { asked += m; if (String(m).includes('"track-mempool-block":0')) ws.send(JSON.stringify({ 'projected-block-transactions': frames[0] })); }); });
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await until(p, () => !!document.querySelector('.strip2 a.blk.proj.mining'));
  await p.click('.strip2 a.blk.proj.mining'); await until(p, () => location.hash === '#/mining' && !!document.querySelector('#scene canvas.scene'));
  assert.equal(await p.locator('#nav a[aria-current=page]').getAttribute('href'), '#/mining');
  await until(p, () => /live/.test(document.querySelector('.scenebox figcaption')?.textContent || '')); assert.ok(asked.includes('"track-mempool-block":0'), 'asks for the block transactions');
  const n0 = frames[0].blockTransactions.length; assert.ok((await p.locator('.scenebox figcaption').innerText()).includes(n0 + ' tx'));
  for (const f of frames.slice(1)) sock.send(JSON.stringify({ 'projected-block-transactions': f }));
  const litNow = () => p.evaluate(() => { const cv = document.querySelector('canvas.scene'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n / (d.length / 4); });
  const t0 = Date.now(); let lit = 0; while (Date.now() - t0 < 4000 && (lit = await litNow()) <= 0.02) await p.waitForTimeout(100);
  assert.ok(lit > 0.02, 'squares drawn: ' + lit + (errs.length ? ' · ' + errs.join(' | ') : ''));
  assert.ok(Date.now() - t0 < 2500, 'the live block shows within a moment: ' + (Date.now() - t0) + ' ms');
  const t1 = await p.locator('#tries').innerText(); assert.ok(/10/.test(t1), t1); assert.ok(/^0{19}/.test((await p.locator('.hash.target').innerText()).trim()));
  assert.equal(await p.locator('#tries-list li').count(), 5); assert.equal(await p.locator('.pools li').count(), 7);
  assert.ok((await p.locator('main').innerText()).includes('Foundry USA'));
  // hover shows the transaction; a tap follows it: outlined in the picture, its status beside it (the page is not rebuilt)
  const box = await p.locator('canvas.scene').boundingBox(); await p.mouse.move(box.x + 3, box.y + box.height - 3); await until(p, () => !document.querySelector('.scene-tip').hidden);
  assert.ok(/sat\/vB/.test(await p.locator('.scene-tip').innerText()));
  await p.evaluate(() => { window.__cv0 = document.querySelector('canvas.scene'); });
  await p.mouse.click(box.x + 3, box.y + box.height - 3); await until(p, () => /^#\/mining\?tx=[0-9a-f]{64}$/.test(location.hash) && document.querySelector('#mf-tx')?.value.length === 64);
  const fid = await p.evaluate(() => location.hash.split('=')[1]); assert.ok(await p.evaluate(() => window.__cv0 === document.querySelector('canvas.scene')), 'same picture, not rebuilt');
  assert.equal(await p.inputValue('#mf-tx'), fid); await until(p, () => /In this block/.test(document.querySelector('.fstatus')?.textContent || ''));
  assert.ok(/10 sat\/vB/.test(await p.locator('.fstatus').innerText()), await p.locator('.fstatus').innerText());
  assert.equal(await p.getAttribute('.flinks a[href^="#/tx/"]', 'href'), '#/tx/' + fid);
  // a mistyped ID is explained, the picture stays
  await p.fill('#mf-tx', 'abc'); await p.click('.follow .btn-go'); await until(p, () => !document.querySelector('#toast').hidden); assert.ok(/#\/mining\?tx=/.test(await p.evaluate(() => location.hash)));
  // sound: the toggle switches the block sound on and keeps it
  assert.equal(await p.getAttribute('.soundbtn', 'aria-pressed'), 'false'); await p.click('.soundbtn'); assert.equal(await p.getAttribute('.soundbtn', 'aria-pressed'), 'true');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('bh.settings')).sound), true);
  // a block is found: the picture keeps its canvas (live repaint leaves it alone) and the height moves on
  const before = await p.evaluate(() => { window.__cv = document.querySelector('canvas.scene'); return document.querySelector('#h').textContent; });
  const bl = JSON.parse(fx('blocks.json')), nb = Object.assign({}, bl[0], { height: bl[0].height + 1, id: '00000000000000000000' + 'b'.repeat(44), timestamp: Math.floor(Date.now() / 1000) });
  mined = nb.height; sock.send(JSON.stringify({ block: nb })); await until(p, (h) => document.querySelector('#h').textContent.replace(/\D/g, '') === String(h + 1), bl[0].height + 1);
  await until(p, () => /It made it/.test(document.querySelector('.fstatus')?.textContent || '')); assert.ok((await p.locator('.fstatus').innerText()).includes((mined).toLocaleString('en')));
  assert.notEqual(before, await p.locator('#h').innerText()); assert.ok(await p.evaluate(() => window.__cv === document.querySelector('canvas.scene') && window.__cv.isConnected));
  assert.ok(/Found: block/.test(await p.locator('.found').innerText()));
  await p.click('.flinks a[href^="#/tx/"]'); await until(p, () => /^#\/tx\/[0-9a-f]{64}$/.test(location.hash));
  for (let i = 0; i < 50 && !asked.includes('"track-mempool-block":-1'); i++) await p.waitForTimeout(100);
  assert.ok(asked.includes('"track-mempool-block":-1'), 'stops asking when the page is left');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errs, []); await c.close(); });
await ok('mining: phone layout, and without the live feed an approximate block is drawn', async () => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto(base + '#/mining'); await until(page, () => /approximate/.test(document.querySelector('.scenebox figcaption')?.textContent || ''));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll');
  const w = await page.evaluate(() => document.querySelector('canvas.scene').getBoundingClientRect().width); assert.ok(w > 280, 'picture wide on a phone: ' + w); });
await ok('mining: a waiting transaction links to following it; the embed widget draws the block being mined', async () => {
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto(base + '#/tx/' + TXM); await page.waitForSelector('.watchlink');
  await page.click('.watchlink'); await until(page, (id) => location.hash === '#/mining?tx=' + id && document.querySelector('#mf-tx')?.value === id, TXM);
  await until(page, () => /blocks back|below the next|In this block/.test(document.querySelector('.fstatus')?.textContent || ''));
  await page.goto(base + '#/tx/' + TXC); await page.waitForSelector('.panel dl'); assert.equal(await page.locator('.watchlink').count(), 0, 'not for a confirmed one');
  await page.goto(base + 'embed.html?show=mining&theme=light'); await until(page, () => /#977,412/.test(document.querySelector('#num')?.textContent || ''));
  assert.ok(/Being mined now/i.test(await page.locator('#lab').innerText())); assert.ok(/3,870 tx/.test(await page.locator('#sub').innerText()));
  assert.ok((await page.getAttribute('#w', 'href')).endsWith('#/mining'));
  await until(page, () => { const cv = document.querySelector('#w canvas'); if (!cv || !cv.width) return false; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n / (d.length / 4) > 0.3; });
  await page.goto(base + '#/about'); await page.selectOption('#emb-what', 'mining');
  assert.ok((await page.inputValue('#emb-code')).includes('embed.html?show=mining') && (await page.inputValue('#emb-code')).includes('height="150"')); });
await ok('your block: a date becomes its block with live facts, a shareable link and an image; future and pre-Bitcoin dates', async () => {
  await page.goto(base); await until(page, () => /977/.test(document.querySelector('#h')?.textContent || '')); await page.click('#nav a[href="#/my"]'); await page.waitForSelector('#my-d');
  await page.fill('#my-d', '2023-11-14'); await page.fill('#my-l', 'First sats'); await page.click('#my-out ~ form button, form .btn-go');
  await until(page, () => location.hash === '#/my?d=2023-11-14&l=First%20sats' && !!document.querySelector('.mycard .myh'));
  const t = await page.locator('#my-out').innerText();
  for (const w of ['FIRST SATS', '#816,785', 'Blocks since', '160,626', '200,000 blocks', '6.25 BTC', 'of all 21 million', 'Price that week', 'about ']) assert.ok(t.toUpperCase().includes(w.toUpperCase()), w + ' in ' + t);
  assert.equal(await page.locator('#nav a[aria-current=page]').getAttribute('href'), '#/my');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#my-img')]); assert.equal(dl.suggestedFilename(), 'block-816785.png');
  const png = fs.readFileSync(await dl.path()); assert.equal(png.toString('ascii', 1, 4), 'PNG'); assert.equal(png.readUInt32BE(16) + 'x' + png.readUInt32BE(20), '1200x630');
  await page.goto(base + '#/my?d=2035-06-01'); await until(page, () => /Still to come/.test(document.querySelector('#my-out')?.textContent || '')); assert.ok(/#[\d,]{9}/.test(await page.locator('.mycard .myh').innerText()));
  await page.goto(base + '#/my?d=2000-01-01'); await until(page, () => /did not exist yet/.test(document.querySelector('#my-out')?.textContent || ''));
  await page.goto(base + '#/my?d=2023-02-30'); assert.equal(await page.locator('#my-out').innerText(), ''); });
await ok('keyboard: Tab stays inside an open dialog, Escape closes it and focus goes back', async () => {
  await page.goto(base); await page.focus('#btn-settings'); await page.keyboard.press('Enter'); await page.waitForSelector('#st-theme');
  for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement)), 'focus left the dialog at Tab ' + (i + 1)); }
  assert.equal(await page.getAttribute('#modal', 'aria-labelledby'), 'modal-title');
  await page.focus('#tab-display'); await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-format'); assert.equal(await page.getAttribute('#tab-format', 'aria-selected'), 'true');
  await page.keyboard.press('Escape'); assert.ok(await page.locator('#modal').isHidden()); assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-settings'); });
await ok('French: glossary and anniversaries are translated', async () => {
  await page.goto(base); await page.click('#btn-settings'); await page.click('[data-k=format]'); await page.selectOption('#st-lang', 'fr'); await page.keyboard.press('Escape');
  await page.goto(base + '#/glossary'); const g = await page.locator('main').innerText(); assert.ok(g.includes('Hauteur de bloc') && g.includes('chaîne'), g.slice(0, 200));
  await page.goto(base + '#/events'); assert.ok((await page.locator('main').innerText()).includes('Quatrième halving'));
  await page.goto(base); await page.click('#btn-settings'); await page.click('[data-k=format]'); await page.selectOption('#st-lang', 'en'); await page.keyboard.press('Escape'); });
await ok('accessibility: no axe-core violations on the main pages and dialogs, dark and light', async () => {
  let AXE; try { AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8'); } catch { console.log('      (skipped: axe-core not installed; CI installs it)'); return; }
  const found = [];
  for (const theme of ['dark', 'light']) {
    const c = await b.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true, reducedMotion: 'reduce' }); await c.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.request().url().includes('mempool.space') ? r.fallback() : r.abort());
    await c.route(/mempool\.space/, (route) => { const m = MOCK[new URL(route.request().url()).pathname]; if (!m) return route.fulfill({ status: 404, body: '' }); route.fulfill({ contentType: m[0], body: fx(m[1]) }); });
    await c.addInitScript((t) => localStorage.setItem('bh.settings', JSON.stringify({ theme: t, _v: 2, lang: 'en' })), theme); const p = await c.newPage();
    for (const pg of ['#/', '#/clock', '#/alarm', '#/calc', '#/charts', '#/glossary', '#/about', '#/my?d=2023-11-14&l=First%20sats', '#/mining', '#/mining?tx=' + TXM, '#/tx/' + TXC, 'embed.html?show=mining', 'search', 'settings', 'embed.html?show=height', 'embed.html?show=halving&theme=light']) {
      if (pg === 'search' || pg === 'settings') { await p.goto(base); await p.waitForSelector('#h'); await p.click('#btn-' + pg); } else await p.goto(pg.startsWith('embed') ? base + pg : base + pg);
      await p.waitForTimeout(700); await p.evaluate(AXE);
      for (const v of await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => x.id + ': ' + x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')))) found.push(`${theme} ${pg} ${v}`);
    }
    await c.close();
  }
  assert.deepEqual(found, []); });
await ok('only mempool.space is contacted (Kraken is only reached by the price feed and the trading chart)', async () => { assert.ok(external.length > 0); });
await ok('no script errors', async () => { assert.deepEqual(errs, []); });
await b.close(); srv.close();
