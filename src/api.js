// Network layer: mempool.space public REST + websocket. Last good values are cached in localStorage.
export const BASE = 'https://mempool.space/api';
export const WS_URL = 'wss://mempool.space/api/v1/ws';

export function store(key, val) { try { if (val === undefined) { const s = localStorage.getItem('bh.' + key); return s ? JSON.parse(s) : null; } localStorage.setItem('bh.' + key, JSON.stringify(val)); } catch { /* storage may be blocked */ } return val === undefined ? null : val; }

export async function getJSON(path, { cacheKey, text } = {}) {
  try {
    const r = await fetch(BASE + path, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = text ? await r.text() : await r.json();
    if (cacheKey) store(cacheKey, v);
    return v;
  } catch (e) {
    if (cacheKey) { const c = store(cacheKey); if (c !== null) { c.__stale = true; return c; } }
    throw e;
  }
}
export const api = {
  tip: () => getJSON('/blocks/tip/height', { text: true, cacheKey: 'tip' }),
  blocks: (h) => getJSON('/v1/blocks' + (h != null ? '/' + h : ''), { cacheKey: h == null ? 'blocks' : undefined }),
  block: (hash) => getJSON('/v1/block/' + hash),
  hashAt: (h) => getJSON('/block-height/' + h, { text: true }),
  difficulty: () => getJSON('/v1/difficulty-adjustment', { cacheKey: 'diff' }),
  fees: () => getJSON('/v1/fees/recommended', { cacheKey: 'fees' }),
  mempool: () => getJSON('/mempool', { cacheKey: 'mempool' }),
  projected: () => getJSON('/v1/fees/mempool-blocks', { cacheKey: 'projected' }),
  prices: () => getJSON('/v1/prices', { cacheKey: 'prices' }),
  hashrate: () => getJSON('/v1/mining/hashrate/1y', { cacheKey: 'hashrate' }),
  lightning: () => getJSON('/v1/lightning/statistics/latest', { cacheKey: 'ln' }),
  pools: () => getJSON('/v1/mining/pools/1w', { cacheKey: 'pools' }), // each pool's blocks in the past week (the Mining page)
  tx: (id) => getJSON('/tx/' + id),
  // history for the Charts page (not saved in localStorage: the price history is over a megabyte)
  priceHistory: (cur) => getJSON('/v1/historical-price?currency=' + encodeURIComponent(cur)),
  hashrateHistory: (r) => getJSON('/v1/mining/hashrate/' + r),
  priceAt: (cur, ts) => getJSON('/v1/historical-price?currency=' + encodeURIComponent(cur) + '&timestamp=' + Math.floor(ts)),
  feeHistory: (r) => getJSON('/v1/mining/blocks/fee-rates/' + r),
  byTime: (ts) => getJSON('/v1/mining/blocks/timestamp/' + ts),
};

// Trading chart history: Kraken's last 720 candles of one timeframe (Kraken's public REST API, no key). Not cached.
export const KRAKEN_REST = 'https://api.kraken.com/0/public/OHLC';
export async function krakenCandles(pair, minutes) {
  const r = await fetch(KRAKEN_REST + '?pair=' + encodeURIComponent(pair) + '&interval=' + minutes, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Live feed with reconnect (3 s), paused while the page is hidden or offline.
// The Mining page asks for the next block's transactions too (track-mempool-block 0, -1 to stop); sent again after a reconnect.
let sock = null, tracking = false;
export function trackBlock(on) {
  if (on === tracking) return; tracking = on;
  try { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ 'track-mempool-block': on ? 0 : -1 })); } catch { /* sent on the next connect */ }
}
export function live(onMsg, onState) {
  let ws, timer, stopped = false;
  const open = () => {
    clearTimeout(timer);
    if (stopped || document.hidden || navigator.onLine === false) return;
    try { ws = sock = new WebSocket(WS_URL); } catch { onState('poll'); return; }
    ws.onopen = () => { onState('on'); ws.send(JSON.stringify({ action: 'init' })); ws.send(JSON.stringify({ action: 'want', data: ['blocks', 'stats', 'mempool-blocks'] })); if (tracking) ws.send(JSON.stringify({ 'track-mempool-block': 0 })); };
    ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
    ws.onclose = () => { onState('poll'); if (!stopped) timer = setTimeout(open, 3000); };
    ws.onerror = () => { try { ws.close(); } catch { /* */ } };
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState > 1)) open(); });
  addEventListener('online', open);
  addEventListener('offline', () => onState('off'));
  open();
  return () => { stopped = true; clearTimeout(timer); try { ws && ws.close(); } catch { /* */ } };
}
