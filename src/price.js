// Live BTC price from Kraken's public websocket (no key). While Kraken is not delivering, a second public feed
// (Coinbase Exchange, also no key) takes over for the currencies it trades (USD, EUR, GBP), and closes again as soon as
// Kraken is back. The other currencies, and everything if both are down, come from the mempool.space poll in data.js.
import { parseOhlc, parseBook, applyBook, bookChecksum, pricePrecision, parseTrades } from './lib.js';
export const KRAKEN_URL = 'wss://ws.kraken.com/v2';
export const BACKUP_URL = 'wss://ws-feed.exchange.coinbase.com';
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'AUD', 'JPY'];
export const BACKUP_CURRENCIES = ['USD', 'EUR', 'GBP'];
// How long Kraken may go without a price before the backup feed is opened: 15 s while it is not connected, four times
// that while it is connected but quiet (a calm market can be quiet for a while).
export const BACKUP_AFTER = 15000;

// Pure: raw websocket text -> [{cur, price, pct}] (empty for status, subscribe acks and bad frames).
export function parseTicker(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || m.channel !== 'ticker' || !Array.isArray(m.data)) return [];
    return m.data
      .filter(
        (d) =>
          d && typeof d.symbol === 'string' && /^BTC\/[A-Z]{3}$/.test(d.symbol) && Number.isFinite(d.last) && d.last > 0
      )
      .map((d) => ({
        cur: d.symbol.slice(4),
        price: d.last,
        pct: Number.isFinite(d.change_pct) ? d.change_pct : null,
      }));
  } catch {
    return [];
  }
}
// Pure: a Coinbase Exchange ticker frame -> [{cur, price, pct}]; numbers arrive as strings, the 24 h change is worked
// out from the price 24 hours ago (open_24h).
export function parseBackupTicker(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || m.type !== 'ticker' || typeof m.product_id !== 'string') return [];
    const pm = /^BTC-([A-Z]{3})$/.exec(m.product_id),
      price = parseFloat(m.price),
      open = parseFloat(m.open_24h);
    if (!pm || !Number.isFinite(price) || price <= 0) return [];
    return [{ cur: pm[1], price, pct: Number.isFinite(open) && open > 0 ? (price / open - 1) * 100 : null }];
  } catch {
    return [];
  }
}

// One websocket with the app's reconnect rules (the same one-socket rules as live() in api.js): it waits while the tab
// is hidden or offline and retries with a growing delay. onFrame gets each message; returns { open, close }.
function socket(url, subscribe, onFrame, onDown) {
  let ws,
    timer,
    on = false,
    delay = 3000;
  const open = () => {
    on = true;
    clearTimeout(timer);
    if (document.hidden || navigator.onLine === false || (ws && ws.readyState <= 1)) return;
    let s;
    try {
      s = ws = new WebSocket(url);
    } catch {
      onDown();
      return;
    }
    s.onopen = () => {
      if (s !== ws) return s.close();
      delay = 3000;
      s.send(JSON.stringify(subscribe));
    };
    s.onmessage = (e) => {
      if (s === ws) onFrame(e.data);
    };
    s.onclose = () => {
      if (s !== ws) return;
      ws = null;
      onDown();
      if (on) {
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
  const close = () => {
    on = false;
    clearTimeout(timer);
    const s = ws;
    ws = null;
    try {
      s && s.close();
    } catch {
      /* */
    }
  };
  return { open, close, isOn: () => on, connected: () => !!ws && ws.readyState === 1 };
}

// onTick({cur, price, pct}) for each price; onState(name) with the live source ('Kraken', 'Coinbase') or '' when none.
export function livePrice(onTick, onState, wait = BACKUP_AFTER) {
  let source = '',
    krakenAt = Date.now(),
    stopped = false;
  const set = (s) => {
    if (s !== source) onState((source = s));
  };
  const kraken = socket(
    KRAKEN_URL,
    { method: 'subscribe', params: { channel: 'ticker', symbol: CURRENCIES.map((c) => 'BTC/' + c) } },
    (raw) => {
      const t = parseTicker(raw);
      if (!t.length) return;
      krakenAt = Date.now();
      if (backup.isOn()) backup.close();
      set('Kraken');
      t.forEach(onTick);
    },
    () => {
      if (source === 'Kraken') set('');
    }
  );
  const backup = socket(
    BACKUP_URL,
    { type: 'subscribe', product_ids: BACKUP_CURRENCIES.map((c) => 'BTC-' + c), channels: ['ticker_batch'] },
    (raw) => {
      const t = parseBackupTicker(raw);
      if (!t.length || Date.now() - krakenAt < wait) return;
      set('Coinbase');
      t.forEach(onTick);
    },
    () => {
      if (source === 'Coinbase') set('');
    }
  );
  // Kraken silent for too long: open the backup (it closes again on Kraken's next price).
  const watch = setInterval(
    () => {
      if (stopped || document.hidden) return;
      const quiet = Date.now() - krakenAt;
      if (!backup.isOn() && quiet >= (kraken.connected() ? 4 * wait : wait)) backup.open();
    },
    Math.min(5000, wait)
  );
  const wake = () => {
    if (stopped || document.hidden) return;
    kraken.open();
    if (backup.isOn()) backup.open();
  };
  document.addEventListener('visibilitychange', wake);
  addEventListener('online', wake);
  kraken.open();
  return () => {
    stopped = true;
    clearInterval(watch);
    kraken.close();
    backup.close();
  };
}

// The trading chart's own feed, one websocket for one currency: candles of one timeframe (a few recent ones on subscribe,
// then an update on every trade), the order book 25 levels deep and the trades. Every book update is checked against
// Kraken's checksum; on a mismatch the book is fetched afresh. Opened only while the chart is on screen; once `alive()`
// is false it closes for good. Returns { stop, setInterval(minutes) } to change timeframe without reconnecting.
export function liveMarket(cur, minutes, on, onState, alive) {
  let ws,
    timer,
    stopped = false,
    delay = 3000,
    book = null,
    tf = minutes;
  const sym = ['BTC/' + cur],
    send = (o) => {
      try {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
      } catch {
        /* reconnect resends */
      }
    };
  const sub = (params) => send({ method: 'subscribe', params: Object.assign({ symbol: sym, snapshot: true }, params) });
  const bookSub = { channel: 'book', depth: 25 };
  const open = () => {
    clearTimeout(timer);
    if (stopped || document.hidden || navigator.onLine === false) return;
    let s;
    try {
      s = ws = new WebSocket(KRAKEN_URL);
    } catch {
      onState(false);
      return;
    }
    s.onopen = () => {
      if (s !== ws) return s.close();
      delay = 3000;
      book = null;
      sub({ channel: 'ohlc', interval: tf });
      if (on.book) sub(bookSub);
      if (on.trades) sub({ channel: 'trade' });
    };
    s.onmessage = (e) => {
      if (s !== ws) return;
      if (!alive()) return stop();
      const f = parseOhlc(e.data);
      if (f) {
        if (f.cur === cur && f.interval === tf) {
          onState(true);
          on.candles(f);
        }
        return;
      }
      const b = on.book && parseBook(e.data);
      if (b && b.cur === cur) {
        if (b.type === 'update' && !book) return; // an update before its snapshot
        book = applyBook(book, b);
        if (Number.isFinite(b.checksum) && bookChecksum(book, pricePrecision(cur)) !== b.checksum) {
          book = null;
          send({ method: 'unsubscribe', params: Object.assign({ symbol: sym }, bookSub) });
          setTimeout(() => sub(bookSub), 300);
          return;
        }
        on.book(book);
        return;
      }
      const tr = on.trades && parseTrades(e.data);
      if (tr && tr.cur === cur) on.trades(tr);
    };
    s.onclose = () => {
      if (stopped || s !== ws) return;
      onState(false);
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, 30000);
    };
    s.onerror = () => {
      try {
        s.close();
      } catch {
        /* */
      }
    };
  };
  const wake = () => {
    if (!alive()) return stop();
    if (!document.hidden && (!ws || ws.readyState > 1)) open();
  };
  const watch = setInterval(() => {
    if (!alive()) stop();
  }, 2000);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    clearInterval(watch);
    document.removeEventListener('visibilitychange', wake);
    removeEventListener('online', wake);
    try {
      ws && ws.close();
    } catch {
      /* */
    }
  }
  document.addEventListener('visibilitychange', wake);
  addEventListener('online', wake);
  open();
  return {
    stop,
    setInterval: (m) => {
      if (m === tf) return;
      send({ method: 'unsubscribe', params: { channel: 'ohlc', symbol: sym, interval: tf } });
      tf = m;
      sub({ channel: 'ohlc', interval: tf });
    },
  };
}
