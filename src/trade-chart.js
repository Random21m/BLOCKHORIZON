// Trading chart: live BTC candlesticks from Kraken. History from Kraken's REST API (720 candles of the chosen timeframe),
// then one websocket moves the newest candle on every trade and feeds the order book and trades beside the chart.
// Indicators: volume, EMA 20, SMA 50, SMA 200, Bollinger Bands 20/2, RSI 14 and MACD 12/26/9 (own panes).
// Tools: horizontal lines and trend lines (kept per currency), price alerts (they fire anywhere in the app, see data.js).
// Zoom (wheel, pinch, + and -), scroll (drag, Shift+arrows), crosshair with open/high/low/close, keyboard reading,
// full screen. Drawn on a canvas; everything that matters is also in HTML for screen readers.
import * as L from './lib.js';
import { krakenCandles, store } from './api.js';
import { liveMarket, CURRENCIES } from './price.js';
import { t } from './i18n.js';
import { S, save, fmtD, el, hooks, priceAlerts, fmtPrice } from './state.js';
import { addPriceAlert, removePriceAlert } from './view-tools.js';
import { sidePanel } from './trade-side.js';

// [key, label, colour token]; overlays first, then volume, then the panes.
const INDS = [['ema20', 'EMA 20', '--blue'], ['sma50', 'SMA 50', '--warn'], ['sma200', 'SMA 200', '--teal'], ['bb', 'BB 20', '--pink'], ['vol', () => t('volume'), null], ['rsi', 'RSI 14', '--violet'], ['macd', 'MACD', '--blue']];
const OVERLAYS = ['ema20', 'sma50', 'sma200'];
const DEF_IND = { ema20: true, sma50: true, sma200: false, bb: false, vol: true, rsi: false, macd: false };
const TOOLS = [['cursor', 'toolCursor', '↖'], ['hline', 'toolHline', '—'], ['trend', 'toolTrend', '╱'], ['alert', 'toolAlert', '⏰']];
const AXIS_W = 72, TIME_H = 24, RIGHT_PAD = 4, MIN_N = 12, HIT = 7; // px; empty candles right of the newest; fewest candles shown; pick distance
const MONO = '11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const drawingsAll = () => store('drawings') || {};

export function tradeChart() {
  const cur = S.cur, ind = Object.assign({}, DEF_IND, S.tradeInd || {});
  let tf = L.TIMEFRAMES[S.tradeTf] ? S.tradeTf : '1h', minutes = L.TIMEFRAMES[tf];
  const pf = (v) => L.fmtNum(v, L.priceDigits(v)), tick = 10 ** -L.pricePrecision(cur), roundP = (p) => +(Math.round(p / tick) * tick).toFixed(L.pricePrecision(cur));
  let candles = [], calc = {}, live = false, failed = false, count = 0, off = 0, hover = -1, hoverY = NaN, hoverPx = 0, raf = 0, load = 0;
  let tool = 'cursor', pending = null, sel = null; // pending: first point of a trend line; sel: { kind: 'draw' | 'alert', id }
  let drawings = (drawingsAll()[cur] || []).filter((d) => d && d.id);
  const saveDrawings = () => { const all = drawingsAll(); all[cur] = drawings; store('drawings', all); };

  // ---- toolbar ----
  const pressed = (b, on) => b.setAttribute('aria-pressed', String(on));
  const tfButtons = Object.keys(L.TIMEFRAMES).map((k) => el('button', { 'data-tf': k, 'aria-pressed': String(k === tf), onclick: () => setTf(k) }, k));
  const indButtons = INDS.map(([k, name, color]) => el('button', { 'data-ind': k, 'aria-pressed': String(!!ind[k]), style: color ? `--sw:var(${color})` : null,
    onclick: (e) => { ind[k] = !ind[k]; S.tradeInd = Object.assign({}, ind); save(); pressed(e.currentTarget, ind[k]); panesClass(); compute(); paint(); } }, color ? el('i', { class: 'sw', 'aria-hidden': 'true' }) : null, typeof name === 'function' ? name() : name));
  const toolButtons = TOOLS.map(([k, key, icon]) => el('button', { 'data-tool': k, 'aria-pressed': String(k === tool), title: t(key + 'Tip'), onclick: () => setTool(k) }, el('span', { 'aria-hidden': 'true', class: 'ticon' }, icon), t(key)));
  const delBtn = el('button', { class: 'tbtn', id: 't-del', disabled: true, onclick: () => deleteSel() }, t('deleteSel'));
  const clearBtn = el('button', { class: 'tbtn', id: 't-clear', onclick: () => { if (!drawings.length) return; drawings = []; if (sel && sel.kind === 'draw') sel = null; saveDrawings(); syncSel(); paint(); } }, t('clearDrawings'));
  const curSel = el('select', { 'aria-label': t('currency'), onchange: (e) => { S.cur = e.target.value; save(); hooks.renderView(); } }, CURRENCIES.map((c) => el('option', { value: c, selected: c === cur }, c)));
  const sideBtn = el('button', { class: 'tbtn', id: 't-side', 'aria-pressed': String(S.tradeSide !== false), onclick: () => { S.tradeSide = S.tradeSide === false; save(); pressed(sideBtn, S.tradeSide); grid.classList.toggle('noside', !S.tradeSide); requestAnimationFrame(() => { fit(); paint(); }); } }, t('orderBook'));
  const resetBtn = el('button', { class: 'tbtn', onclick: () => { fit(); paint(); } }, t('resetView'));
  const fsBtn = document.fullscreenEnabled ? el('button', { class: 'tbtn', 'aria-pressed': 'false', onclick: () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else panel.requestFullscreen().catch(() => {}); } }, t('fullScreen')) : null;
  const state = el('span', { class: 'lstate' }, el('i', { 'aria-hidden': 'true' }), el('span', null, t('loading')));

  // ---- header, legend, alerts ----
  const lastEl = el('b', { class: 'tprice' }, '–'), chgEl = el('span', { class: 'tchg' });
  const legend = el('div', { class: 'tlegend', 'aria-hidden': 'true' });
  const said = el('span', { class: 'sr-only', 'aria-live': 'polite' });
  const note = el('p', { class: 'dim tnote', hidden: true });
  const alertList = el('div', { class: 'talerts', role: 'list', 'aria-label': t('activePrice') });
  const toolHint = el('p', { class: 'dim thint', 'aria-live': 'polite' });

  // ---- plot ----
  const cv = el('canvas', { 'aria-hidden': 'true' });
  const box = el('div', { class: 'tplot', tabindex: 0, role: 'group', 'aria-roledescription': 'chart' }, cv, legend, said);
  const side = sidePanel(cur, (p) => { if (tool === 'alert') placeAlert(p); else if (tool === 'hline') placeH(p); });
  const grid = el('div', { class: 'tgrid' + (S.tradeSide === false ? ' noside' : '') }, el('div', { class: 'tmain' }, box, alertList, toolHint), side.el);
  const panel = el('section', { class: 'panel tpanel', id: 'ch-trade' },
    el('div', { class: 'thead' }, el('h2', null, 'BTC/' + cur), lastEl, chgEl, state),
    el('div', { class: 'tbar' },
      el('div', { class: 'tabs tf', role: 'group', 'aria-label': t('timeframeL') }, tfButtons),
      el('div', { class: 'tabs tind', role: 'group', 'aria-label': t('indicatorsL') }, indButtons)),
    el('div', { class: 'tbar' },
      el('div', { class: 'tabs ttool', role: 'group', 'aria-label': t('toolsL') }, toolButtons), delBtn, clearBtn,
      el('div', { class: 'ttools' }, curSel, sideBtn, resetBtn, fsBtn)),
    grid, note, el('p', { class: 'dim thelp' }, t('tradeHelp')));
  const panesClass = () => box.classList.toggle('panes', !!(ind.rsi || ind.macd)); panesClass();
  const alive = () => panel.isConnected;
  const label = () => box.setAttribute('aria-label', t('tradeAria', { p: 'BTC/' + cur, tf }));
  label();

  // ---- data ----
  function compute() {
    const c = candles.map((k) => k.c);
    calc = { ema20: ind.ema20 ? L.ema(c, 20) : null, sma50: ind.sma50 ? L.sma(c, 50) : null, sma200: ind.sma200 ? L.sma(c, 200) : null,
      bb: ind.bb ? L.bollinger(c, 20, 2) : null, rsi: ind.rsi ? L.rsi(c, 14) : null, macd: ind.macd ? L.macd(c, 12, 26, 9) : null };
  }
  const width = () => Math.max(1, box.clientWidth - AXIS_W);
  function fit() { count = Math.max(MIN_N, Math.min(candles.length + RIGHT_PAD, Math.round(width() / 9))); off = 0; } // about 9 px per candle
  const clamp = () => { count = Math.max(MIN_N, Math.min(Math.max(MIN_N, candles.length + RIGHT_PAD), count)); off = Math.max(-RIGHT_PAD + 1, Math.min(candles.length - MIN_N / 2, off)); };
  function add(list, hist) {
    const wasEmpty = !candles.length;
    candles = hist ? L.mergeCandles(list, candles) : L.mergeCandles(candles, list); // websocket candles are newer than history
    if (wasEmpty || hist) fit();
    compute(); header(); paint();
  }
  function header() {
    const k = candles[candles.length - 1]; if (!k) return;
    const prev = candles[candles.length - 2], ch = prev ? (k.c / prev.c - 1) * 100 : (k.c / k.o - 1) * 100;
    lastEl.textContent = pf(k.c) + ' ' + cur; lastEl.className = 'tprice ' + (ch >= 0 ? 'up' : 'down');
    chgEl.textContent = (ch >= 0 ? '▲ +' : '▼ ') + ch.toFixed(2) + '% ' + t('vsPrev', { tf }); chgEl.className = 'tchg ' + (ch >= 0 ? 'up' : 'down');
  }
  const setState = (on) => { live = on; state.classList.toggle('on', on); state.lastChild.textContent = on ? t('live') + ' · Kraken' : failed && !candles.length ? t('chartError') : t('reconnecting'); };
  function history() {
    const my = ++load; failed = false; note.hidden = true;
    krakenCandles(L.krakenPair(cur), minutes).then((r) => { const h = L.parseKrakenRest(r); if (!h.length) throw new Error('empty'); if (alive() && my === load) add(h, true); })
      .catch(() => { if (my !== load) return; failed = true; note.hidden = false; note.textContent = t('historyError'); if (!live) setState(false); });
  }
  let market = { setInterval: () => {} };
  function setTf(k) {
    if (k === tf) return; tf = k; minutes = L.TIMEFRAMES[k]; S.tradeTf = k; save();
    tfButtons.forEach((b) => pressed(b, b.dataset.tf === k)); label();
    candles = []; hover = -1; compute(); lastEl.textContent = '–'; chgEl.textContent = ''; paint();
    history(); market.setInterval(minutes);
  }
  queueMicrotask(() => {
    if (!alive()) return;
    history();
    market = liveMarket(cur, minutes, { candles: (f) => { if (f.interval === minutes) add(f.candles, false); }, book: side.book, trades: side.trades }, setState, alive);
    const ro = new ResizeObserver(() => { if (!alive()) return ro.disconnect(); paint(); }); ro.observe(box);
    const onFs = () => { if (!alive()) return document.removeEventListener('fullscreenchange', onFs); if (fsBtn) pressed(fsBtn, document.fullscreenElement === panel); requestAnimationFrame(() => { fit(); paint(); }); };
    const onAlerts = () => { if (!alive()) return document.removeEventListener('bh-alerts', onAlerts); if (sel && sel.kind === 'alert' && !priceAlerts().some((a) => a.id === sel.id)) { sel = null; syncSel(); } alertsList(); paint(); };
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('bh-alerts', onAlerts);
    alertsList();
  });

  // ---- tools, drawings and alerts ----
  const myAlerts = () => priceAlerts().filter((a) => a.cur === cur);
  function alertsList() {
    alertList.replaceChildren(...myAlerts().map((a) => el('span', { class: 'talert', role: 'listitem' }, '⏰ ' + (a.dir === 'up' ? '≥ ' : '≤ ') + fmtPrice(a.price, cur),
      el('button', { 'aria-label': t('removeAlert', { p: fmtPrice(a.price, cur) }), onclick: () => removePriceAlert(a.id) }, '✕'))));
  }
  function setTool(k) {
    tool = k; pending = null; toolButtons.forEach((b) => pressed(b, b.dataset.tool === k));
    box.classList.toggle('drawing', k !== 'cursor');
    toolHint.textContent = k === 'cursor' ? '' : t({ hline: 'hintHline', trend: 'hintTrend1', alert: 'hintAlert' }[k]); paint();
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function placeH(p) { const v = roundP(p); drawings.push({ id: newId(), type: 'h', p: v }); saveDrawings(); setTool('cursor'); toolHint.textContent = t('placedH', { p: pf(v) }); }
  function placeAlert(p) { if (addPriceAlert(cur, roundP(p))) setTool('cursor'); }
  function syncSel() { delBtn.disabled = !sel; }
  function deleteSel() {
    if (!sel) return;
    if (sel.kind === 'alert') removePriceAlert(sel.id); else { drawings = drawings.filter((d) => d.id !== sel.id); saveDrawings(); }
    sel = null; syncSel(); paint();
  }

  // ---- geometry: index i is drawn at x(i); the newest candle sits RIGHT_PAD candles from the axis when off = 0 ----
  const tfMs = () => minutes * 6e4;
  const geo = () => { const w = width(), cw = w / count, right = candles.length - 1 + RIGHT_PAD - off; return { w, cw, right, x: (i) => w - (right - i + 0.5) * cw, at: (px) => Math.round(right - (w - px) / cw + 0.5), fi: (px) => right + 0.5 - (w - px) / cw }; };
  const idxOf = (ms) => candles.length - 1 + (ms - candles[candles.length - 1].t) / tfMs(); // a time as a (fractional) candle index
  const timeOf = (fi) => candles[candles.length - 1].t + (fi - (candles.length - 1)) * tfMs();
  let Ymain = null, Pmain = null, mainH = 0; // set by draw(): price <-> y in the main pane

  // ---- drawing ----
  function paint() { if (!raf) raf = requestAnimationFrame(draw); }
  function draw() {
    raf = 0; if (!alive()) return;
    const W = box.clientWidth, H = box.clientHeight, dpr = devicePixelRatio || 1;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!candles.length) { legend.replaceChildren(); Ymain = null; return; }
    clamp();
    const cs = getComputedStyle(panel), col = (v) => cs.getPropertyValue(v).trim();
    const C = { text: col('--text'), dim: col('--dim'), line: col('--line'), grid: col('--line2'), up: col('--up'), down: col('--down'), bg: col('--card'), warn: col('--warn'), accent: col('--accent') };
    const { w, cw, right, x } = geo(), plotH = H - TIME_H;
    const panes = ['rsi', 'macd'].filter((k) => ind[k]), paneH = panes.length ? Math.round(plotH * (panes.length > 1 ? 0.18 : 0.22)) : 0;
    mainH = plotH - paneH * panes.length;
    const i0 = Math.max(0, Math.floor(right - count + 1)), i1 = Math.min(candles.length - 1, Math.ceil(right));
    let lo = Infinity, hi = -Infinity; const take = (v) => { if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
    for (let i = i0; i <= i1; i++) { take(candles[i].l); take(candles[i].h); for (const k of OVERLAYS) if (calc[k]) take(calc[k][i]); if (calc.bb) { take(calc.bb.up[i]); take(calc.bb.lo[i]); } }
    if (!(hi > lo)) { hi = (hi || 1) * 1.001; lo = (lo || 1) * 0.999; }
    const volH = ind.vol ? mainH * 0.2 : 0, top = Math.max(20, legend.offsetHeight + 10), bottom = mainH - (ind.vol ? volH * 0.6 : 8), pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const Y = (p) => top + (hi - p) / (hi - lo) * (bottom - top), P = (y) => hi - (y - top) / (bottom - top) * (hi - lo);
    Ymain = Y; Pmain = P;
    g.font = MONO; g.textBaseline = 'middle'; g.lineWidth = 1;

    // grid and price axis
    const tk = L.ticks(lo, hi, false, Math.max(3, Math.round(mainH / 70))), td = tk.length > 1 && tk[1] - tk[0] < 1 ? 2 : 0;
    g.strokeStyle = C.grid; g.fillStyle = C.dim; g.textAlign = 'left';
    for (const v of tk) { const y = Math.round(Y(v)) + 0.5; if (y < 4 || y > mainH - 4) continue; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillText(L.fmtNum(v, td), w + 8, y); }
    // time axis: round times (every 15 min, 1 h, 6 h, 1 day, 1 month...) at least ~100 px apart
    const step = L.timeStep(minutes, cw), dayTf = minutes >= 1440;
    g.textAlign = 'center';
    for (let i = Math.max(i0, 1); i <= i1; i++) {
      if (!L.onStep(candles[i].t, candles[i - 1].t, step, S.utc)) continue;
      const xx = Math.round(x(i)) + 0.5; if (xx < 28 || xx > w - 28) continue;
      g.strokeStyle = C.grid; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, plotH); g.stroke();
      g.fillStyle = C.dim; g.fillText(axisTime(candles[i].t, step >= 1440), xx, plotH + TIME_H / 2);
    }
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(w + 0.5, 0); g.lineTo(w + 0.5, plotH); g.moveTo(0, plotH + 0.5); g.lineTo(W, plotH + 0.5);
    panes.forEach((_, k) => { const y = mainH + paneH * k + 0.5; g.moveTo(0, y); g.lineTo(W, y); }); g.stroke();

    g.save(); g.beginPath(); g.rect(0, 0, w, mainH); g.clip();
    // Bollinger Bands: a light fill between the bands, then the three lines
    if (calc.bb) {
      const b = calc.bb, pink = col('--pink'); g.fillStyle = pink; g.globalAlpha = 0.07; g.beginPath(); let started = false, last = -1;
      for (let i = i0; i <= i1; i++) if (Number.isFinite(b.up[i])) { if (!started) { g.moveTo(x(i), Y(b.up[i])); started = true; } else g.lineTo(x(i), Y(b.up[i])); last = i; }
      for (let i = last; i >= i0 && started; i--) if (Number.isFinite(b.lo[i])) g.lineTo(x(i), Y(b.lo[i]));
      if (started) g.fill(); g.globalAlpha = 1;
      line(g, b.up, i0, i1, x, Y, pink); line(g, b.lo, i0, i1, x, Y, pink); g.setLineDash([4, 3]); line(g, b.mid, i0, i1, x, Y, pink); g.setLineDash([]);
    }
    // volume
    if (ind.vol) {
      let vmax = 0; for (let i = i0; i <= i1; i++) vmax = Math.max(vmax, candles[i].v);
      g.globalAlpha = 0.32;
      for (let i = i0; i <= i1; i++) { const k = candles[i], vh = vmax ? k.v / vmax * volH : 0; g.fillStyle = k.c >= k.o ? C.up : C.down; g.fillRect(x(i) - Math.max(1, cw * 0.36), mainH - vh, Math.max(1, cw * 0.72), vh); }
      g.globalAlpha = 1;
    }
    // candles
    const bw = Math.max(1, Math.min(cw * 0.72, 24));
    for (let i = i0; i <= i1; i++) {
      const k = candles[i], up = k.c >= k.o, cx = Math.round(x(i)) + 0.5; g.strokeStyle = g.fillStyle = up ? C.up : C.down;
      g.beginPath(); g.moveTo(cx, Y(k.h)); g.lineTo(cx, Y(k.l)); g.stroke();
      const yo = Y(k.o), yc = Y(k.c), y = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
      if (bw < 3) { g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, y + bh); g.stroke(); } else g.fillRect(Math.round(cx - bw / 2), y, Math.round(bw), bh);
    }
    // moving averages
    g.lineWidth = 1.5; g.lineJoin = 'round';
    for (const [k, , v] of INDS) if (OVERLAYS.includes(k) && calc[k]) line(g, calc[k], i0, i1, x, Y, col(v));
    // drawings, then the trend line being drawn
    for (const d of drawings) {
      const on = sel && sel.kind === 'draw' && sel.id === d.id; g.strokeStyle = on ? C.accent : C.text; g.lineWidth = on ? 2.5 : 1.5;
      if (d.type === 'h') { const y = Math.round(Y(d.p)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      else if (d.type === 'trend') { const a = [x(idxOf(d.t1)), Y(d.p1)], b = [x(idxOf(d.t2)), Y(d.p2)]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); if (on) { g.fillStyle = C.accent; for (const q of [a, b]) g.fillRect(q[0] - 3, q[1] - 3, 6, 6); } }
    }
    if (pending && hover >= 0 && Number.isFinite(hoverY)) { g.strokeStyle = C.accent; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x(idxOf(pending.t1)), Y(pending.p1)); g.lineTo(hoverPx, hoverY); g.stroke(); g.setLineDash([]); }
    // alert lines
    for (const a of myAlerts()) { const y = Math.round(Y(a.price)) + 0.5, on = sel && sel.kind === 'alert' && sel.id === a.id; if (y < 0 || y > mainH) continue; g.strokeStyle = on ? C.accent : C.warn; g.lineWidth = on ? 2 : 1; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.setLineDash([]); }
    g.restore(); g.lineWidth = 1;
    for (const d of drawings) if (d.type === 'h') { const y = Y(d.p); if (y > 9 && y < mainH - 9) tag(g, pf(d.p), w, y, W - w, C.text, C.bg); }
    for (const a of myAlerts()) { const y = Y(a.price); if (y > 9 && y < mainH - 9) tag(g, '⏰' + pf(a.price), w, y, W - w, C.warn, C.bg); }

    // last price line and label
    const lastK = candles[candles.length - 1], ly = Y(lastK.c), lc = lastK.c >= lastK.o ? C.up : C.down;
    if (ly > 0 && ly < mainH) { g.strokeStyle = lc; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, Math.round(ly) + 0.5); g.lineTo(w, Math.round(ly) + 0.5); g.stroke(); g.setLineDash([]); tag(g, pf(lastK.c), w, ly, W - w, lc, '#fff'); }

    // panes below: RSI 14 (30/70 guides) and MACD 12/26/9 (histogram, MACD and signal lines)
    panes.forEach((k, n) => {
      const y0 = mainH + paneH * n, r0 = y0 + 6, r1 = y0 + paneH - 6;
      g.save(); g.beginPath(); g.rect(0, y0, w, paneH); g.clip();
      if (k === 'rsi') {
        const RY = (v) => r0 + (100 - v) / 100 * (r1 - r0);
        g.lineWidth = 1; g.strokeStyle = C.line; g.setLineDash([2, 3]); for (const v of [30, 70]) { const y = Math.round(RY(v)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.setLineDash([]);
        g.lineWidth = 1.5; line(g, calc.rsi, i0, i1, x, RY, col('--violet')); g.restore();
        g.fillStyle = C.dim; g.textAlign = 'left'; for (const v of [30, 70]) g.fillText(String(v), w + 8, RY(v));
      } else {
        const m = calc.macd; let a = 0; for (let i = i0; i <= i1; i++) for (const v of [m.macd[i], m.signal[i], m.hist[i]]) if (Number.isFinite(v)) a = Math.max(a, Math.abs(v));
        a = a || 1; const MY = (v) => (r0 + r1) / 2 - v / a * (r1 - r0) / 2;
        g.lineWidth = 1; g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, Math.round(MY(0)) + 0.5); g.lineTo(w, Math.round(MY(0)) + 0.5); g.stroke();
        g.globalAlpha = 0.45; for (let i = i0; i <= i1; i++) { const v = m.hist[i]; if (!Number.isFinite(v)) continue; g.fillStyle = v >= 0 ? C.up : C.down; const y = MY(v), z = MY(0); g.fillRect(x(i) - Math.max(1, cw * 0.36), Math.min(y, z), Math.max(1, cw * 0.72), Math.max(1, Math.abs(y - z))); }
        g.globalAlpha = 1; g.lineWidth = 1.5; line(g, m.macd, i0, i1, x, MY, col('--blue')); line(g, m.signal, i0, i1, x, MY, col('--warn')); g.restore();
        g.fillStyle = C.dim; g.textAlign = 'left'; g.fillText(L.fmtNum(a, a < 10 ? 2 : 0), w + 8, r0 + 4); g.fillText(L.fmtNum(-a, a < 10 ? 2 : 0), w + 8, r1 - 4);
      }
      g.fillStyle = C.dim; g.textAlign = 'left'; g.fillText(k === 'rsi' ? 'RSI 14' : 'MACD 12 26 9', 6, y0 + 12);
    });
    g.lineWidth = 1;

    // crosshair
    const hi_ = hover >= 0 && hover < candles.length ? hover : -1;
    if (hi_ >= 0) {
      const xx = Math.round(x(hi_)) + 0.5; g.strokeStyle = C.dim; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, plotH);
      if (hoverY >= 0 && hoverY < mainH) { g.moveTo(0, Math.round(hoverY) + 0.5); g.lineTo(w, Math.round(hoverY) + 0.5); }
      g.stroke(); g.setLineDash([]);
      if (hoverY >= 0 && hoverY < mainH) tag(g, pf(P(hoverY)), w, hoverY, W - w, C.text, C.bg);
      const tl = fmtD(candles[hi_].t, dayTf ? { dateOnly: true } : {}); g.font = MONO;
      const tw = g.measureText(tl).width + 12, tx = Math.max(0, Math.min(w - tw, xx - tw / 2)); g.fillStyle = C.text; g.fillRect(tx, plotH + 2, tw, TIME_H - 4); g.fillStyle = C.bg; g.textAlign = 'center'; g.fillText(tl, tx + tw / 2, plotH + TIME_H / 2);
    }
    const lh = legend.offsetHeight; legendFor(hi_ >= 0 ? hi_ : candles.length - 1); if (legend.offsetHeight !== lh) paint(); // the legend wrapped: make room
  }
  function line(g, vals, i0, i1, x, Y, color) {
    g.strokeStyle = color; g.beginPath(); let pen = false;
    for (let i = i0; i <= i1; i++) { const v = vals[i]; if (!Number.isFinite(v)) { pen = false; continue; } if (pen) g.lineTo(x(i), Y(v)); else { g.moveTo(x(i), Y(v)); pen = true; } }
    g.stroke();
  }
  function tag(g, text, x0, y, wd, bg, fg) { g.fillStyle = bg; g.fillRect(x0 + 1, y - 9, wd - 1, 18); g.fillStyle = fg; g.textAlign = 'left'; g.fillText(text, x0 + 6, y); }
  function axisTime(ms, dayTf) {
    const o = { h12: S.h12, utc: S.utc, dateFmt: S.dateFmt }, d = new Date(ms), mid = S.utc ? d.getUTCHours() === 0 && d.getUTCMinutes() === 0 : d.getHours() === 0 && d.getMinutes() === 0;
    if (dayTf || mid) { const s = L.fmtDate(ms, Object.assign(o, { dateOnly: true })); return o.dateFmt === 'iso' ? s.slice(5) : s.slice(0, 5); }
    return L.fmtDate(ms, Object.assign(o, { timeOnly: true }));
  }
  function readout(i) { const k = candles[i]; return { k, ch: (k.c / k.o - 1) * 100, time: fmtD(k.t, minutes >= 1440 ? { dateOnly: true } : {}) }; }
  function legendFor(i) {
    const { k, ch } = readout(i), cls = k.c >= k.o ? 'up' : 'down', kv = (a, b, c) => el('span', null, a + ' ', el('b', { class: c || cls }, b));
    const n = (v) => (Number.isFinite(v) ? pf(v) : '–'), m2 = (v) => (Number.isFinite(v) ? L.fmtNum(v, Math.abs(v) < 10 ? 2 : 1) : '–');
    const extra = INDS.filter(([key]) => OVERLAYS.includes(key) && calc[key]).map(([key, name, v]) => el('span', { style: `color:var(${v})` }, name + ' ' + n(calc[key][i])));
    if (calc.bb) extra.push(el('span', { style: 'color:var(--pink)' }, 'BB ' + n(calc.bb.up[i]) + ' / ' + n(calc.bb.lo[i])));
    if (calc.rsi) extra.push(el('span', { style: 'color:var(--violet)' }, 'RSI ' + (Number.isFinite(calc.rsi[i]) ? calc.rsi[i].toFixed(1) : '–')));
    if (calc.macd) extra.push(el('span', { style: 'color:var(--blue)' }, 'MACD ' + m2(calc.macd.macd[i]) + ' / ' + m2(calc.macd.signal[i])));
    legend.replaceChildren(el('div', null, kv('O', pf(k.o)), kv('H', pf(k.h)), kv('L', pf(k.l)), kv('C', pf(k.c)), el('b', { class: cls }, (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'),
      ind.vol ? kv(t('volShort'), L.fmtNum(k.v, k.v < 10 ? 3 : 1), 'dimv') : null), extra.length ? el('div', null, extra) : null);
  }
  function speak(i) { const { k, ch, time } = readout(i); said.textContent = t('candleSay', { t: time, o: pf(k.o), h: pf(k.h), l: pf(k.l), c: pf(k.c), ch: (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%' }); }

  // ---- picking: the drawing or alert line nearest a point, within HIT px ----
  function pick(px, py) {
    if (!Ymain || !candles.length) return null; const { x } = geo(); let best = null, bd = HIT;
    const consider = (d, kind, id) => { if (d < bd) { bd = d; best = { kind, id }; } };
    for (const a of myAlerts()) consider(Math.abs(Ymain(a.price) - py), 'alert', a.id);
    for (const d of drawings) {
      if (d.type === 'h') consider(Math.abs(Ymain(d.p) - py), 'draw', d.id);
      else { const ax = x(idxOf(d.t1)), ay = Ymain(d.p1), bx = x(idxOf(d.t2)), by = Ymain(d.p2), dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); consider(Math.hypot(px - ax - u * dx, py - ay - u * dy), 'draw', d.id); }
    }
    return best;
  }
  function clickAt(px, py) {
    if (!Ymain || py > mainH || px > width()) return;
    const p = Pmain(py);
    if (tool === 'hline') return placeH(p);
    if (tool === 'alert') return placeAlert(p);
    if (tool === 'trend') {
      const tm = timeOf(geo().fi(px));
      if (!pending) { pending = { t1: tm, p1: roundP(p) }; toolHint.textContent = t('hintTrend2'); paint(); return; }
      drawings.push({ id: newId(), type: 'trend', t1: pending.t1, p1: pending.p1, t2: tm, p2: roundP(p) }); saveDrawings(); setTool('cursor'); toolHint.textContent = t('placedTrend'); return;
    }
    sel = pick(px, py); syncSel(); paint();
  }

  // ---- interaction ----
  const local = (e) => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const zoom = (f, px) => { // keep the candle under px where it is
    const g0 = geo(), at = g0.right - (g0.w - px) / g0.cw; count = count * f; clamp();
    const cw = g0.w / count; off = candles.length - 1 + RIGHT_PAD - (at + (g0.w - px) / cw); clamp(); paint();
  };
  const ptrs = new Map(); let drag = null, pinch = null;
  box.addEventListener('wheel', (e) => { if (!candles.length) return; e.preventDefault(); zoom(Math.pow(1.0015, e.deltaY), Math.min(local(e)[0], width())); }, { passive: false });
  box.addEventListener('pointerdown', (e) => {
    if (!candles.length) return; box.setPointerCapture(e.pointerId); const pt = local(e); ptrs.set(e.pointerId, pt);
    if (ptrs.size === 1) drag = { x: pt[0], y: pt[1], off, moved: false };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.abs(a[0] - b[0]) || 1, count, mid: (a[0] + b[0]) / 2 }; drag = null; }
  });
  box.addEventListener('pointermove', (e) => {
    if (!candles.length) return; const [px, py] = local(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.abs(a[0] - b[0]) || 1; zoom(pinch.count * pinch.d / d / count, Math.min(pinch.mid, width())); return; }
    if (drag) { const dx = px - drag.x; if (Math.abs(dx) > 4 || Math.abs(py - drag.y) > 4) drag.moved = true; if (drag.moved) { off = drag.off + dx / geo().cw; clamp(); } }
    hover = px < width() ? geo().at(px) : -1; hoverY = py; hoverPx = px;
    box.classList.toggle('pick', tool === 'cursor' && !drag && !!pick(px, py)); paint();
  });
  const up = (e) => {
    const click = e.type === 'pointerup' && drag && ptrs.size === 1 && !drag.moved ? local(e) : null;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null;
    if (click) clickAt(click[0], click[1]);
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ptrs.size && document.activeElement !== box) { hover = -1; paint(); } });
  box.addEventListener('dblclick', () => { if (tool === 'cursor') { fit(); paint(); } });
  box.addEventListener('focus', () => { if (!candles.length) return; if (hover < 0) hover = candles.length - 1; hoverY = NaN; paint(); speak(hover); });
  box.addEventListener('blur', () => { hover = -1; paint(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (tool !== 'cursor' || sel)) { e.preventDefault(); e.stopPropagation(); sel = null; syncSel(); setTool('cursor'); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSel(); return; }
    if (!candles.length || e.ctrlKey || e.metaKey || e.altKey) return; const n = candles.length, at = hover < 0 ? n - 1 : hover;
    if (e.key === 'h' || e.key === 'a') { e.preventDefault(); if (e.key === 'h') placeH(candles[at].c); else placeAlert(candles[at].c); return; }
    const move = { ArrowLeft: -1, ArrowRight: 1, PageUp: -10, PageDown: 10 }[e.key];
    if (move && e.shiftKey) { e.preventDefault(); off -= move * Math.max(1, Math.round(count / 10)); clamp(); paint(); return; }
    if (move) { e.preventDefault(); hover = Math.max(0, Math.min(n - 1, at + move)); keepVisible(); hoverY = NaN; paint(); speak(hover); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); hover = e.key === 'Home' ? 0 : n - 1; keepVisible(); hoverY = NaN; paint(); speak(hover); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1 / 1.25, hover >= 0 ? geo().x(hover) : width()); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(1.25, hover >= 0 ? geo().x(hover) : width()); }
    else if (e.key === '0') { e.preventDefault(); fit(); paint(); }
  });
  function keepVisible() { const g0 = geo(), first = g0.right - count + 1; if (hover < first + 1) off += first + 1 - hover; else if (hover > g0.right - 1) off -= hover - (g0.right - 1); clamp(); }

  return panel;
}
