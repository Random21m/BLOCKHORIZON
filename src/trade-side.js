// Beside the trading chart: Kraken's order book (10 levels each side, depth bars, spread) and the latest trades.
// Rows are built once and only their text changes, at most once per animation frame.
import * as L from './lib.js';
import { t } from './i18n.js';
import { S, el } from './state.js';

const LEVELS = 10, TRADES = 40;

export function sidePanel(cur, onPrice) {
  const qf = (q) => L.fmtNum(q, q >= 100 ? 2 : 4), pf = (p) => L.fmtNum(p, L.pricePrecision(cur));
  // Each price is a button, switched on only while the chart's Line or Alert tool is chosen (then Tab reaches it and
  // Enter uses it; the whole row is its click area). Otherwise it is disabled: out of the Tab order, plain text.
  let mode = 'cursor';
  const label = (p) => t(mode === 'alert' ? 'bookAlert' : 'bookLine', { p: pf(p) + ' ' + cur });
  const row = (cls) => {
    const b = el('button', { class: 'bp', type: 'button', disabled: true, hidden: true, onclick: () => { if (r.dataset.p) onPrice(+r.dataset.p); } });
    const r = el('div', { class: 'brow ' + cls, role: 'row' }, el('span', { role: 'cell' }, b), el('span', { role: 'cell' }), el('span', { role: 'cell' })); return r;
  };
  const asks = Array.from({ length: LEVELS }, () => row('ask')), bids = Array.from({ length: LEVELS }, () => row('bid'));
  const spread = el('div', { class: 'bspread', role: 'row' }, el('span', { role: 'cell' }), el('span', { role: 'cell' }));
  const head = (a, b, c) => el('div', { class: 'brow bhead', role: 'row' }, el('span', { role: 'columnheader' }, a), el('span', { role: 'columnheader' }, b), el('span', { role: 'columnheader' }, c));
  const bookEl = el('div', { class: 'book', role: 'table', 'aria-label': t('orderBook') + ' BTC/' + cur }, head(t('priceL') + ' (' + cur + ')', t('amountL') + ' (BTC)', t('totalL')), asks.slice().reverse(), spread, bids);
  const tradeRows = el('div', { class: 'tlist', role: 'rowgroup', tabindex: 0 }); // it scrolls: reachable by keyboard
  const tradesEl = el('div', { class: 'trades', role: 'table', 'aria-label': t('recentTrades') + ' BTC/' + cur }, head(t('priceL'), t('amountL'), t('timeL')), tradeRows);
  const waiting = () => el('p', { class: 'dim bwait' }, t('loading'));
  const el_ = el('aside', { class: 'tside', 'aria-label': t('orderBook') + ' · ' + t('recentTrades') },
    el('h3', null, t('orderBook')), el('div', { class: 'bwrap' }, bookEl, waiting()), el('h3', null, t('recentTrades')), el('div', { class: 'twrap' }, tradesEl, waiting()));
  let book = null, list = [], raf = 0;
  const paint = () => {
    raf = 0;
    if (book && book.bids.length && book.asks.length) {
      el_.querySelector('.bwrap .bwait')?.remove();
      const fill = (rows, side) => { let cum = 0; const tot = side.slice(0, LEVELS).reduce((a, x) => a + x.q, 0) || 1;
        rows.forEach((r, i) => { const x = side[i]; const [a, b, c] = r.children;
          const btn = a.firstChild;
          if (!x) { btn.textContent = b.textContent = c.textContent = ''; btn.disabled = btn.hidden = true; r.style.setProperty('--d', '0%'); delete r.dataset.p; return; }
          btn.hidden = false; btn.disabled = mode === 'cursor'; if (!btn.disabled) btn.setAttribute('aria-label', label(x.p)); else btn.removeAttribute('aria-label');
          cum += x.q; btn.textContent = pf(x.p); b.textContent = qf(x.q); c.textContent = qf(cum); r.style.setProperty('--d', (cum / tot * 100).toFixed(1) + '%'); r.dataset.p = x.p; }); };
      fill(asks, book.asks); fill(bids, book.bids);
      const a = book.asks[0].p, b = book.bids[0].p, sp = a - b;
      spread.children[0].textContent = pf((a + b) / 2); spread.children[1].textContent = t('spreadL') + ' ' + pf(sp) + ' (' + (sp / a * 100).toFixed(3) + '%)';
    }
    if (list.length) {
      el_.querySelector('.twrap .bwait')?.remove();
      const o = { h12: S.h12, utc: S.utc, dateFmt: S.dateFmt, timeOnly: true, sec: true };
      tradeRows.replaceChildren(...list.slice(-TRADES).reverse().map((x) => el('div', { class: 'brow ' + (x.side === 'buy' ? 'bid' : 'ask'), role: 'row' },
        el('span', { role: 'cell' }, pf(x.p)), el('span', { role: 'cell' }, qf(x.q)), el('span', { role: 'cell' }, L.fmtDate(x.t, o)))));
    }
  };
  const later = () => { if (!raf) raf = requestAnimationFrame(paint); };
  return {
    el: el_,
    book: (b) => { book = b; later(); },
    setMode: (m) => { mode = m === 'hline' || m === 'alert' ? m : 'cursor'; bookEl.classList.toggle('armed', mode !== 'cursor'); if (raf) cancelAnimationFrame(raf); paint(); },
    trades: (f) => { list = (f.type === 'snapshot' ? f.trades : list.concat(f.trades)).slice(-TRADES); later(); },
  };
}
