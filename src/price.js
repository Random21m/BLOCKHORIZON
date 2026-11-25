// Live BTC price from Kraken's public websocket (no key). Falls back to the mempool.space poll in app.js if it is down.
import { parseOhlc } from './lib.js';
export const KRAKEN_URL = 'wss://ws.kraken.com/v2';
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'AUD', 'JPY'];

// Pure: raw websocket text -> [{cur, price, pct}] (empty for status, subscribe acks and bad frames).
export function parseTicker(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || m.channel !== 'ticker' || !Array.isArray(m.data)) return [];
    return m.data.filter((d) => d && typeof d.symbol === 'string' && /^BTC\/[A-Z]{3}$/.test(d.symbol) && Number.isFinite(d.last) && d.last > 0)
      .map((d) => ({ cur: d.symbol.slice(4), price: d.last, pct: Number.isFinite(d.change_pct) ? d.change_pct : null }));
  } catch { return []; }
}

export function livePrice(onTick, onState) {
  let ws, timer, stopped = false, delay = 3000;
  const open = () => {
    clearTimeout(timer);
    if (stopped || document.hidden || navigator.onLine === false) return;
    try { ws = new WebSocket(KRAKEN_URL); } catch { onState(false); return; }
    ws.onopen = () => { delay = 3000; ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: CURRENCIES.map((c) => 'BTC/' + c) } })); };
    ws.onmessage = (e) => { const t = parseTicker(e.data); if (t.length) { onState(true); t.forEach(onTick); } };
    ws.onclose = () => { onState(false); if (!stopped) { timer = setTimeout(open, delay); delay = Math.min(delay * 2, 30000); } };
    ws.onerror = () => { try { ws.close(); } catch { /* */ } };
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState > 1)) open(); });
  addEventListener('online', open);
  open();
  return () => { stopped = true; clearTimeout(timer); try { ws && ws.close(); } catch { /* */ } };
}

// The trading chart's own feed: Kraken candles of one timeframe for one currency (a few recent ones on subscribe, then an
// update on every trade). Opened only while the chart is on screen; once `alive()` is false it closes for good.
export function liveCandles(cur, minutes, onFrame, onState, alive) {
  let ws, timer, stopped = false, delay = 3000;
  const open = () => {
    clearTimeout(timer);
    if (stopped || document.hidden || navigator.onLine === false) return;
    try { ws = new WebSocket(KRAKEN_URL); } catch { onState(false); return; }
    ws.onopen = () => { delay = 3000; ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ohlc', symbol: ['BTC/' + cur], interval: minutes, snapshot: true } })); };
    ws.onmessage = (e) => { if (!alive()) return stop(); const f = parseOhlc(e.data); if (f && f.cur === cur && f.interval === minutes) { onState(true); onFrame(f); } };
    ws.onclose = () => { if (stopped) return; onState(false); timer = setTimeout(open, delay); delay = Math.min(delay * 2, 30000); };
    ws.onerror = () => { try { ws.close(); } catch { /* */ } };
  };
  const wake = () => { if (!alive()) return stop(); if (!document.hidden && (!ws || ws.readyState > 1)) open(); };
  const watch = setInterval(() => { if (!alive()) stop(); }, 2000);
  function stop() { stopped = true; clearTimeout(timer); clearInterval(watch); document.removeEventListener('visibilitychange', wake); removeEventListener('online', wake); try { ws && ws.close(); } catch { /* */ } }
  document.addEventListener('visibilitychange', wake); addEventListener('online', wake);
  open();
  return stop;
}
