// Offline shell. App files are fetched network-first (so a new version shows up on the next open) and kept in the cache
// for offline use; live API calls always go to the network (the app keeps its own last-value cache).
const CACHE = 'blockhorizon-v0.17.0';
const FILES = ['./', 'index.html', 'embed.html', 'embed.css', 'style.css', 'privacy.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'docs/support-qr.svg',
  'src/app.js', 'src/state.js', 'src/data.js', 'src/ui.js', 'src/view-dash.js', 'src/view-chain.js', 'src/view-tools.js', 'src/view-info.js', 'src/view-charts.js', 'src/trade-chart.js', 'src/trade-side.js', 'src/view-my.js', 'src/view-mining.js', 'src/block-scene.js', 'src/arrival.js', 'src/embed.js', 'src/modals.js', 'src/price.js', 'src/api.js', 'src/lib.js', 'src/i18n.js', 'src/sound.js', 'src/content.js', 'src/content-i18n.js', 'src/lang/en.js', 'src/nostr.js', 'config.json'];
// cache: 'reload' skips the browser's HTTP cache, so a new version never caches yesterday's files.
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
const savedPages = new Set(), newer = new Set(); // pages (client ids) shown from the saved copy / that got a file newer than it
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // only the app's own files: a self-hosted copy also serves the data API at ./api/ (same origin), and those answers must
  // never be cached here or served from here (the app keeps its own last values)
  if (e.request.method !== 'GET' || u.origin !== location.origin || /\/api\//.test(u.pathname)) return;
  const nav = e.request.mode === 'navigate', page = nav ? e.resultingClientId : e.clientId;
  // a fresh file that differs from the saved one marks its page: that page must not take any other file from the saved copy
  const net = fetch(e.request, { cache: 'no-cache' }).then((r) => { if (!r.ok) return r; const c = r.clone(), d = r.clone();
    return caches.open(CACHE).then((x) => x.match(e.request, { ignoreSearch: true }).then((old) => old ? Promise.all([old.text(), d.text()]).then(([a, b]) => { if (a !== b && page) newer.add(page); }) : null)
      .then(() => x.put(e.request, c))).then(() => r, () => r); });
  const cached = () => caches.match(e.request, { ignoreSearch: true });
  e.waitUntil(net.catch(() => {})); // a slow answer still refreshes the cache after the saved copy was shown
  // On a weak connection that never answers, show the saved copy after 3 s instead of a blank page; with nothing saved, keep waiting.
  // One page load uses one version: a page shown from the saved copy takes its files from the saved copy too, and once a page
  // has received a file newer than the saved one it waits for the network for the rest, so old and new modules never mix.
  if (!nav && savedPages.has(e.clientId)) { e.respondWith(cached().then((hit) => hit || net)); return; }
  e.respondWith(new Promise((resolve, reject) => {
    let done = false; const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    const slow = setTimeout(() => { if (!nav && newer.has(page)) return; cached().then((r) => { if (r && !done && nav && page) savedPages.add(page); finish(r); }); }, 3000);
    net.then((r) => { clearTimeout(slow); finish(r); }, () => { clearTimeout(slow);
      cached().then((hit) => hit || caches.match('index.html')).then((r) => { if (r) finish(r); else if (!done) { done = true; reject(new Error('offline')); } }); });
  }));
});
