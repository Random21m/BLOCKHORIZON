// Live BTC price from Kraken's public websocket (no key). Falls back to the mempool.space poll in app.js if it is down.
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
