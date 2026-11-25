// Offline shell. App files are fetched network-first (so a new version shows up on the next open) and kept in the cache
// for offline use; live API calls always go to the network (the app keeps its own last-value cache).
const CACHE = 'blockhorizon-v0.9.1';
const FILES = ['./', 'index.html', 'embed.html', 'embed.css', 'style.css', 'privacy.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'docs/support-qr.svg',
  'src/app.js', 'src/state.js', 'src/data.js', 'src/ui.js', 'src/view-dash.js', 'src/view-chain.js', 'src/view-tools.js', 'src/view-info.js', 'src/view-charts.js', 'src/embed.js', 'src/modals.js', 'src/price.js', 'src/api.js', 'src/lib.js', 'src/i18n.js', 'src/sound.js', 'src/content.js', 'src/content-i18n.js', 'src/strings.js'];
// cache: 'reload' skips the browser's HTTP cache, so a new version never caches yesterday's files.
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const net = fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) { const c = r.clone(); return caches.open(CACHE).then((x) => x.put(e.request, c)).then(() => r, () => r); } return r; });
  const cached = () => caches.match(e.request, { ignoreSearch: true });
  e.waitUntil(net.catch(() => {})); // a slow answer still refreshes the cache after the saved copy was shown
  // On a weak connection that never answers, show the saved copy after 3 s instead of a blank page; with nothing saved, keep waiting.
  e.respondWith(new Promise((resolve, reject) => {
    let done = false; const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    const slow = setTimeout(() => cached().then(finish), 3000);
    net.then((r) => { clearTimeout(slow); finish(r); }, () => { clearTimeout(slow);
      cached().then((hit) => hit || caches.match('index.html')).then((r) => { if (r) finish(r); else if (!done) { done = true; reject(new Error('offline')); } }); });
  }));
});
