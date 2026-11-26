// Live BTC price from Kraken's public websocket (no key). Falls back to the mempool.space poll in app.js if it is down.
import { parseOhlc, parseBook, applyBook, bookChecksum, pricePrecision, parseTrades } from './lib.js';
export const KRAKEN_URL = 'wss://ws.kraken.com/v2';
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'AUD', 'JPY'];

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

export function livePrice(onTick, onState) {
  // the same one-socket rules as live() in api.js
  let ws,
    timer,
    stopped = false,
    delay = 3000;
  const open = () => {
    clearTimeout(timer);
    if (stopped || document.hidden || navigator.onLine === false || (ws && ws.readyState <= 1)) return;
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
      s.send(
        JSON.stringify({
          method: 'subscribe',
          params: { channel: 'ticker', symbol: CURRENCIES.map((c) => 'BTC/' + c) },
        })
      );
    };
    s.onmessage = (e) => {
      if (s !== ws) return;
      const t = parseTicker(e.data);
      if (t.length) {
        onState(true);
        t.forEach(onTick);
      }
    };
    s.onclose = () => {
      if (s !== ws) return;
      onState(false);
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
