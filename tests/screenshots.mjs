// Remakes the README pictures in docs/ from live data: node tests/screenshots.mjs (needs Playwright and network access).
// Serves the site locally, so the pictures show the code in this checkout.
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname), out = (n) => path.join(root, 'docs', n);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch(), settle = (p, ms = 6000) => p.waitForTimeout(ms);
const ready = (p) => p.waitForFunction(() => /\d/.test(document.querySelector('#h')?.textContent || '') && document.querySelectorAll('.strip2 .blk').length > 8, null, { timeout: 30000 });

let p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(base); await ready(p); await settle(p); await p.screenshot({ path: out('dashboard.png') }); console.log('dashboard.png');
// the history charts (price, hashrate, difficulty, fees over a year), below the live trading chart
await p.setViewportSize({ width: 1440, height: 1000 }); await p.goto(base + '#/charts'); await p.waitForSelector('.tabs.range'); await p.click('.tabs.range button:nth-child(2)'); await settle(p, 7000);
await p.evaluate(() => { const h = document.querySelector('.hist'); scrollTo(0, h.getBoundingClientRect().top + scrollY - 70); }); await settle(p, 800); await p.screenshot({ path: out('charts.png') }); console.log('charts.png');
await p.setViewportSize({ width: 1440, height: 1000 }); await p.goto(base + '#/mining'); await settle(p, 9000); await p.screenshot({ path: out('mining.png') }); console.log('mining.png');
await p.close();

p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(base); await ready(p); await settle(p); await p.screenshot({ path: out('phone.png') }); console.log('phone.png');
await p.close();

// The embeddable widget: height, halving and price, dark above and light below (in other languages and currencies).
p = await b.newPage({ viewport: { width: 1000, height: 270 }, deviceScaleFactor: 1.4 }); // the default embed size, 320x120
const f = (q) => `<iframe src="${base}embed.html?${q}" width="320" height="120" style="border:0"></iframe>`;
await p.setContent(`<body style="margin:0;padding:10px 8px;background:#777;display:grid;grid-template-columns:repeat(3,320px);gap:10px 12px">${
  [f('show=height&theme=dark&lang=en'), f('show=halving&theme=dark&lang=en'), f('show=price&theme=dark&lang=en'), f('show=height&theme=light&lang=en'), f('show=halving&theme=light&lang=de'), f('show=price&theme=light&lang=fr&cur=EUR')].join('')}</body>`);
await settle(p, 8000); await p.screenshot({ path: out('widgets.png') }); console.log('widgets.png');
await b.close(); srv.close();
