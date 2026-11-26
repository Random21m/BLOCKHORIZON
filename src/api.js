// Network layer: a mempool.space-compatible REST API + websocket. Last good values are cached in localStorage.
// The server is mempool.space unless the user picks their own (Settings, or the optional config.json of a self-hosted copy,
// e.g. on an Umbrel or Start9 node). If the server cannot be reached, the essentials (height, blocks, fees, mempool,
// transactions) come from blockstream.info's Esplora API instead, so the dashboard keeps counting blocks.
export const DEFAULT_SERVER = 'https://mempool.space';
export const FALLBACK = 'https://blockstream.info';
let server = DEFAULT_SERVER;
// 'mempool.example.com' -> 'https://mempool.example.com'; a trailing slash or /api is dropped; '' or junk -> ''.
export function normServer(s) {
  s = String(s || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');
  if (!s) return '';
  if (s === '/' || s === '.' || s === 'self') return location.origin + location.pathname.replace(/\/[^/]*$/, ''); // the copy's own address (a node proxies /api)
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s) && !/^[^/]+:\d+(\/|$)/.test(s)) return ''; // another scheme (but host:port is fine)
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.protocol.startsWith('http') && !u.search && !u.hash ? (u.origin + u.pathname).replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}
export function setServer(s) {
  server = normServer(s) || DEFAULT_SERVER;
}
export const getServer = () => server;
// The data server's host: where an address is looked up (never the backup server, see api.address).
export const lookupHost = () => {
  try {
    return new URL(server).host;
  } catch {
    return 'mempool.space';
  }
};
export const isDefaultServer = () => server === DEFAULT_SERVER;
export const wsUrl = () => server.replace(/^http/, 'ws') + '/api/v1/ws';
// Which host answered last ('' until something did): shown beside the connection dot, so a fallback is never silent.
export let source = '';

// Called after a key is saved (push.js sends the alarms to the node whenever they change).
export const onStore = {};
export function store(key, val) {
  try {
    if (val === undefined) {
      const s = localStorage.getItem('bh.' + key);
      return s ? JSON.parse(s) : null;
    }
    localStorage.setItem('bh.' + key, JSON.stringify(val));
  } catch {
    /* storage may be blocked */
  }
  if (val !== undefined && onStore[key]) onStore[key](val);
  return val === undefined ? null : val;
}

async function fetchFrom(base, path, text) {
  const r = await fetch(base + '/api' + path, { cache: 'no-store' });
  if (!r.ok) {
    const e = new Error('HTTP ' + r.status);
    e.status = r.status;
    throw e;
  }
  return text ? r.text() : r.json();
}
// Esplora (blockstream.info) answers a few of the same questions in its own shape; null = no fallback for this path.
export function esploraFor(path) {
  if (
    path === '/blocks/tip/height' ||
    path === '/mempool' ||
    /^\/block-height\/\d+$/.test(path) ||
    /^\/tx\/[0-9a-f]{64}$/.test(path)
  )
    return { path };
  let m = path.match(/^\/v1\/blocks(?:\/(\d+))?$/);
  if (m) return { path: '/blocks' + (m[1] ? '/' + m[1] : '') };
  if (path === '/v1/fees/recommended') return { path: '/fee-estimates', map: esploraFees };
  return null;
}
// Esplora's {blocks-to-confirm: sat/vB} -> mempool.space's recommended fees.
export function esploraFees(e) {
  const g = (n) => Math.max(1, Math.round((e[n] ?? e[String(n)] ?? 1) * 10) / 10);
  return { fastestFee: g(1), halfHourFee: g(3), hourFee: g(6), economyFee: g(144), minimumFee: 1 };
}

export async function getJSON(path, { cacheKey, text } = {}) {
  try {
    let v;
    try {
      v = await fetchFrom(server, path, text);
      source = server;
    } catch (e) {
      // a 4xx is an answer (not found, bad request); only an unreachable server or a 5xx falls back
      const f = e.status && e.status < 500 ? null : esploraFor(path);
      if (!f) throw e;
      v = await fetchFrom(FALLBACK, f.path, text);
      if (f.map) v = f.map(v);
      source = FALLBACK;
    }
    if (cacheKey) store(cacheKey, v);
    return v;
  } catch (e) {
    // the saved copy, marked stale (a text answer such as the height is boxed, since a string cannot carry the mark)
    if (cacheKey) {
      const c = store(cacheKey);
      if (c !== null)
        return typeof c === 'object'
          ? Object.assign(c, { __stale: true })
          : Object.assign(new String(c), { __stale: true });
    }
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
  rewards: () => getJSON('/v1/mining/reward-stats/144', { cacheKey: 'rewards' }), // miner revenue and fees over the last 144 blocks (a day)
  tx: (id) => getJSON('/tx/' + id),
  // an address: never asked of the backup server (esploraFor has no /address); the address page says where it went
  address: (a) => getJSON('/address/' + a),
  addrTxs: (a) => getJSON('/address/' + a + '/txs'), // watched addresses ask only your own node (push.js ownNode)
  // history for the Charts page (not saved in localStorage: the price history is over a megabyte)
  priceHistory: (cur) => getJSON('/v1/historical-price?currency=' + encodeURIComponent(cur)),
  hashrateHistory: (r) => getJSON('/v1/mining/hashrate/' + r),
  priceAt: (cur, ts) =>
    getJSON('/v1/historical-price?currency=' + encodeURIComponent(cur) + '&timestamp=' + Math.floor(ts)),
  feeHistory: (r) => getJSON('/v1/mining/blocks/fee-rates/' + r),
  byTime: (ts) => getJSON('/v1/mining/blocks/timestamp/' + ts),
};

// Trading chart history: Kraken's last 720 candles of one timeframe (Kraken's public REST API, no key). Not cached.
export const KRAKEN_REST = 'https://api.kraken.com/0/public/OHLC';
export async function krakenCandles(pair, minutes) {
  const r = await fetch(KRAKEN_REST + '?pair=' + encodeURIComponent(pair) + '&interval=' + minutes, {
    cache: 'no-store',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Live feed with reconnect (3 s), paused while the page is hidden or offline.
// The Mining page asks for the next block's transactions too (track-mempool-block 0, -1 to stop); sent again after a reconnect.
let sock = null,
  tracking = false,
  reopen = null;
export const isTracking = () => tracking; // frames still on the way after leaving the Mining page are ignored
export function trackBlock(on) {
  if (on === tracking) return;
  tracking = on;
  try {
    if (sock && sock.readyState === 1) sock.send(JSON.stringify({ 'track-mempool-block': on ? 0 : -1 }));
  } catch {
    /* sent on the next connect */
  }
}
// Each socket's handlers act only on that socket: an old one closing late never closes or replaces the current one, and
// 'online' / page-visible only open a socket when none is open or connecting. Retries back off from 3 s to 30 s (a server
// without a live feed is not hammered); a successful connection resets the delay.
export function live(onMsg, onState) {
  let ws,
    timer,
    stopped = false,
    delay = 3000;
  // an open socket is closed (its close handler opens the next one 3 s later); a closed one waiting in backoff is opened now
  reopen = () => {
    delay = 3000;
    if (ws && ws.readyState <= 1) {
      try {
        ws.close();
      } catch {
        /* */
      }
    } else open();
  };
  const open = () => {
    clearTimeout(timer);
    if (stopped || document.hidden || navigator.onLine === false || (ws && ws.readyState <= 1)) return;
    let s;
    try {
      s = ws = sock = new WebSocket(wsUrl());
    } catch {
      onState('poll');
      return;
    }
    s.onopen = () => {
      if (s !== ws) return s.close();
      delay = 3000;
      onState('on');
      s.send(JSON.stringify({ action: 'init' }));
      s.send(JSON.stringify({ action: 'want', data: ['blocks', 'stats', 'mempool-blocks'] }));
      if (tracking) s.send(JSON.stringify({ 'track-mempool-block': 0 }));
    };
    s.onmessage = (e) => {
      if (s !== ws) return;
      try {
        onMsg(JSON.parse(e.data));
      } catch {
        /* ignore bad frame */
      }
    };
    s.onclose = () => {
      if (s !== ws) return;
      onState(navigator.onLine === false ? 'off' : 'poll');
      if (!stopped) {
        timer = setTimeout(open, delay);
        delay = Math.min(delay * 2, 30000);
      }
    };
    s.onerror = () => {
      try {
        s.close();
      } catch {
        /* */
      }
    };
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) open();
  });
  addEventListener('online', open);
  // offline: close the socket too, so coming back online opens a fresh one (and reports 'on' again) instead of
  // keeping one that may have survived the blip while the dot and the Mining picture were reset
  addEventListener('offline', () => {
    onState('off');
    try {
      if (ws) ws.close();
    } catch {
      /* */
    }
  });
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    try {
      ws && ws.close();
    } catch {
      /* */
    }
  };
}
// After the server changes: drop the live connection; its close handler reopens it (3 s later) at the new address.
export function reconnect() {
  if (reopen) reopen();
}
// Pick the server: the user's own choice (Settings) wins, then config.json beside the app (a self-hosted copy sets its node
// there), then mempool.space. config.json is optional; a slow or missing one never holds up the start for more than 1.5 s.
export async function loadConfig(userServer) {
  let cfg = null;
  try {
    const ac = new AbortController(),
      to = setTimeout(() => ac.abort(), 1500);
    const r = await fetch('config.json', { cache: 'no-cache', signal: ac.signal });
    clearTimeout(to);
    if (r.ok) cfg = await r.json();
  } catch {
    /* none */
  }
  setServer(userServer || (cfg && cfg.server) || '');
  return cfg || {};
}
