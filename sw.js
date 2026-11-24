// Offline shell. App files are fetched network-first (so a new version shows up on the next open) and kept in the cache
// for offline use; live API calls always go to the network (the app keeps its own last-value cache).
const CACHE = 'blockhorizon-v0.5.5';
const FILES = ['./', 'index.html', 'style.css', 'privacy.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'docs/support-qr.svg',
  'src/app.js', 'src/price.js', 'src/api.js', 'src/lib.js', 'src/i18n.js', 'src/sound.js', 'src/content.js'];
// cache: 'reload' skips the browser's HTTP cache, so a new version never caches yesterday's files.
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
