// Trading chart: live BTC candlesticks from Kraken. History from Kraken's REST API (720 candles of the chosen timeframe),
// then the websocket moves the newest candle on every trade. Volume, EMA 20 / SMA 50 / SMA 200, RSI 14, a crosshair with
// the candle's open/high/low/close, zoom (wheel, pinch, + and -), pan (drag, Shift+arrows), keyboard reading, full screen.
// Drawn on a canvas (hundreds of candles, repainted on every trade); all text that matters is also in HTML for screen readers.
import * as L from './lib.js';
import { krakenCandles } from './api.js';
import { liveCandles, CURRENCIES } from './price.js';
import { t } from './i18n.js';
import { S, save, fmtD, el, hooks } from './state.js';

const INDS = [['ema20', 'EMA 20', '--blue'], ['sma50', 'SMA 50', '--warn'], ['sma200', 'SMA 200', '--teal'], ['vol', () => t('volume'), null], ['rsi', 'RSI 14', '--violet']];
const DEF_IND = { ema20: true, sma50: true, sma200: false, vol: true, rsi: false };
const AXIS_W = 72, TIME_H = 24, RIGHT_PAD = 4; // px for the price axis and time axis; empty candles kept right of the newest
const MIN_N = 12;

export function tradeChart() {
  const cur = S.cur, tf = L.TIMEFRAMES[S.tradeTf] ? S.tradeTf : '1h', minutes = L.TIMEFRAMES[tf];
  const ind = Object.assign({}, DEF_IND, S.tradeInd || {});
  const digits = (v) => L.priceDigits(v), pf = (v) => L.fmtNum(v, digits(v));
  let candles = [], calc = null, live = false, failed = false, count = 0, off = 0, hover = -1, hoverY = NaN, raf = 0;

  // ---- toolbar ----
  const tfButtons = Object.keys(L.TIMEFRAMES).map((k) => el('button', { 'data-tf': k, 'aria-pressed': String(k === tf), onclick: () => { if (k !== tf) { S.tradeTf = k; save(); rebuild(); } } }, k));
  const indButtons = INDS.map(([k, name, color]) => el('button', { 'data-ind': k, 'aria-pressed': String(!!ind[k]), style: color ? `--sw:var(${color})` : null,
    onclick: (e) => { ind[k] = !ind[k]; S.tradeInd = Object.assign({}, ind); save(); e.currentTarget.setAttribute('aria-pressed', String(ind[k])); compute(); paint(); } }, color ? el('i', { class: 'sw', 'aria-hidden': 'true' }) : null, typeof name === 'function' ? name() : name));
  const curSel = el('select', { 'aria-label': t('currency'), onchange: (e) => { S.cur = e.target.value; save(); hooks.renderView(); } }, CURRENCIES.map((c) => el('option', { value: c, selected: c === cur }, c)));
  const resetBtn = el('button', { class: 'tbtn', onclick: () => { fit(); paint(); } }, t('resetView'));
  const fsBtn = document.fullscreenEnabled ? el('button', { class: 'tbtn', 'aria-pressed': 'false', onclick: () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else panel.requestFullscreen().catch(() => {}); } }, t('fullScreen')) : null;
  const state = el('span', { class: 'lstate' }, el('i', { 'aria-hidden': 'true' }), el('span', null, t('loading')));

  // ---- header and legend ----
  const lastEl = el('b', { class: 'tprice' }, '–'), chgEl = el('span', { class: 'tchg' });
  const legend = el('div', { class: 'tlegend', 'aria-hidden': 'true' });
  const said = el('span', { class: 'sr-only', 'aria-live': 'polite' });
  const note = el('p', { class: 'dim tnote', hidden: true });

  // ---- plot ----
  const cv = el('canvas', { 'aria-hidden': 'true' });
  const box = el('div', { class: 'tplot', tabindex: 0, role: 'group', 'aria-roledescription': 'chart', 'aria-label': t('tradeAria', { p: 'BTC/' + cur, tf }) }, cv, legend, said);
  const panel = el('section', { class: 'panel tpanel', id: 'ch-trade' },
    el('div', { class: 'thead' }, el('h2', null, 'BTC/' + cur), lastEl, chgEl, state),
    el('div', { class: 'tbar' },
      el('div', { class: 'tabs tf', role: 'group', 'aria-label': t('timeframeL') }, tfButtons),
      el('div', { class: 'tabs tind', role: 'group', 'aria-label': t('indicatorsL') }, indButtons),
      el('div', { class: 'ttools' }, curSel, resetBtn, fsBtn)),
    box, note, el('p', { class: 'dim thelp' }, t('tradeHelp')));

  function rebuild() { const n = tradeChart(); panel.replaceWith(n); }
  const alive = () => panel.isConnected;

  // ---- data ----
  function compute() {
    const c = candles.map((k) => k.c);
    calc = { ema20: ind.ema20 ? L.ema(c, 20) : null, sma50: ind.sma50 ? L.sma(c, 50) : null, sma200: ind.sma200 ? L.sma(c, 200) : null, rsi: ind.rsi ? L.rsi(c, 14) : null };
  }
  const width = () => Math.max(1, box.clientWidth - AXIS_W);
  function fit() { count = Math.max(MIN_N, Math.min(candles.length + RIGHT_PAD, Math.round(width() / 9))); off = 0; } // about 9 px per candle
  const clamp = () => { count = Math.max(MIN_N, Math.min(Math.max(MIN_N, candles.length + RIGHT_PAD), count)); off = Math.max(-RIGHT_PAD + 1, Math.min(candles.length - MIN_N / 2, off)); };
  function add(list, history) {
    const wasEmpty = !candles.length;
    candles = history ? L.mergeCandles(list, candles) : L.mergeCandles(candles, list); // websocket candles are newer than history
    if (wasEmpty || history) fit();
    compute(); header(); paint();
  }
  function header() {
    const k = candles[candles.length - 1]; if (!k) return;
    const prev = candles[candles.length - 2], up = prev ? k.c >= prev.c : k.c >= k.o, ch = prev ? (k.c / prev.c - 1) * 100 : (k.c / k.o - 1) * 100;
    lastEl.textContent = pf(k.c) + ' ' + cur; lastEl.className = 'tprice ' + (up ? 'up' : 'down');
    chgEl.textContent = (ch >= 0 ? '▲ +' : '▼ ') + ch.toFixed(2) + '% ' + t('vsPrev', { tf }); chgEl.className = 'tchg ' + (ch >= 0 ? 'up' : 'down');
  }
  const setState = (on) => { live = on; state.classList.toggle('on', on); state.lastChild.textContent = on ? t('live') + ' · Kraken' : failed && !candles.length ? t('chartError') : t('reconnecting'); };

  queueMicrotask(() => {
    if (!alive()) return;
    krakenCandles(L.krakenPair(cur), minutes).then((r) => { const h = L.parseKrakenRest(r); if (!h.length) throw new Error('empty'); if (alive()) add(h, true); })
      .catch(() => { failed = true; note.hidden = false; note.textContent = t('historyError'); if (!live) setState(false); });
    liveCandles(cur, minutes, (f) => add(f.candles, false), setState, alive);
    const ro = new ResizeObserver(() => { if (!alive()) return ro.disconnect(); paint(); }); ro.observe(box);
    document.addEventListener('fullscreenchange', function fsc() { if (!alive()) return document.removeEventListener('fullscreenchange', fsc); if (fsBtn) fsBtn.setAttribute('aria-pressed', String(document.fullscreenElement === panel)); requestAnimationFrame(() => { fit(); paint(); }); });
  });

  // ---- geometry: index i is drawn at x(i); the newest candle sits RIGHT_PAD candles from the axis when off = 0 ----
  const geo = () => { const w = width(), cw = w / count, right = candles.length - 1 + RIGHT_PAD - off; return { w, cw, right, x: (i) => w - (right - i + 0.5) * cw, at: (px) => Math.round(right - (w - px) / cw + 0.5) }; };

  // ---- drawing ----
  function paint() { if (!raf) raf = requestAnimationFrame(draw); }
  function draw() {
    raf = 0; if (!alive()) return;
    const W = box.clientWidth, H = box.clientHeight, dpr = devicePixelRatio || 1;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!candles.length) { legend.replaceChildren(); return; }
    clamp();
    const cs = getComputedStyle(panel), col = (v) => cs.getPropertyValue(v).trim();
    const C = { text: col('--text'), dim: col('--dim'), line: col('--line'), grid: col('--line2'), up: col('--up'), down: col('--down'), bg: col('--card') };
    const { w, cw, right, x } = geo(), plotH = H - TIME_H, rsiH = ind.rsi ? Math.round(plotH * 0.22) : 0, mainH = plotH - rsiH;
    const i0 = Math.max(0, Math.floor(right - count + 1)), i1 = Math.min(candles.length - 1, Math.ceil(right));
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) { lo = Math.min(lo, candles[i].l); hi = Math.max(hi, candles[i].h); for (const k of ['ema20', 'sma50', 'sma200']) { const v = calc[k] && calc[k][i]; if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } }
    if (!(hi > lo)) { hi = (hi || 1) * 1.001; lo = (lo || 1) * 0.999; }
    const volH = ind.vol ? mainH * 0.2 : 0, top = 44, bottom = mainH - (ind.vol ? volH * 0.6 : 8), pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const Y = (p) => top + (hi - p) / (hi - lo) * (bottom - top), P = (y) => hi - (y - top) / (bottom - top) * (hi - lo);
    g.font = '11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'; g.textBaseline = 'middle'; g.lineWidth = 1;

    // grid and price axis
    const tk = L.ticks(lo, hi, false, Math.max(3, Math.round(mainH / 70)));
    g.strokeStyle = C.grid; g.fillStyle = C.dim; g.textAlign = 'left';
    const td = tk.length > 1 && tk[1] - tk[0] < 1 ? 2 : 0; // whole numbers unless the ticks are closer than 1
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
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(w + 0.5, 0); g.lineTo(w + 0.5, plotH); g.moveTo(0, plotH + 0.5); g.lineTo(W, plotH + 0.5); if (rsiH) { g.moveTo(0, mainH + 0.5); g.lineTo(w, mainH + 0.5); } g.stroke();

    g.save(); g.beginPath(); g.rect(0, 0, w, mainH); g.clip();
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
      const k = candles[i], up = k.c >= k.o, xx = Math.round(x(i)) + (bw < 3 ? 0.5 : 0); g.strokeStyle = g.fillStyle = up ? C.up : C.down;
      g.beginPath(); g.moveTo(Math.round(x(i)) + 0.5, Y(k.h)); g.lineTo(Math.round(x(i)) + 0.5, Y(k.l)); g.stroke();
      const yo = Y(k.o), yc = Y(k.c), y = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
      if (bw < 3) { g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + bh); g.stroke(); } else g.fillRect(Math.round(xx - bw / 2), y, Math.round(bw), bh);
    }
    // moving averages
    g.lineWidth = 1.5; g.lineJoin = 'round';
    for (const [k, , v] of INDS) { if (!calc[k] || k === 'rsi') continue; line(g, calc[k], i0, i1, x, Y, col(v)); }
    g.restore(); g.lineWidth = 1;

    // last price line and label
    const lastK = candles[candles.length - 1], ly = Y(lastK.c), lc = lastK.c >= lastK.o ? C.up : C.down;
    if (ly > 0 && ly < mainH) { g.strokeStyle = lc; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, Math.round(ly) + 0.5); g.lineTo(w, Math.round(ly) + 0.5); g.stroke(); g.setLineDash([]); tag(g, pf(lastK.c), w, ly, W - w, lc, '#fff'); }

    // RSI pane
    if (rsiH) {
      const r0 = mainH + 6, r1 = plotH - 6, RY = (v) => r0 + (100 - v) / 100 * (r1 - r0);
      g.fillStyle = C.dim; g.textAlign = 'left';
      for (const v of [30, 70]) { const y = Math.round(RY(v)) + 0.5; g.strokeStyle = C.line; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.setLineDash([]); g.fillText(String(v), w + 8, y); }
      g.save(); g.beginPath(); g.rect(0, mainH, w, rsiH); g.clip(); g.lineWidth = 1.5; line(g, calc.rsi, i0, i1, x, RY, col('--violet')); g.restore(); g.lineWidth = 1;
      g.fillStyle = C.dim; g.fillText('RSI 14', 6, mainH + 12);
    }

    // crosshair
    const hi_ = hover >= 0 && hover < candles.length ? hover : -1;
    if (hi_ >= 0) {
      const xx = Math.round(x(hi_)) + 0.5; g.strokeStyle = C.dim; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, plotH);
      if (hoverY >= 0 && hoverY < mainH) { g.moveTo(0, Math.round(hoverY) + 0.5); g.lineTo(w, Math.round(hoverY) + 0.5); }
      g.stroke(); g.setLineDash([]);
      if (hoverY >= 0 && hoverY < mainH) tag(g, pf(P(hoverY)), w, hoverY, W - w, C.text, C.bg);
      const tl = fmtD(candles[hi_].t, dayTf ? { dateOnly: true } : {}); g.font = '11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
      const tw = g.measureText(tl).width + 12, tx = Math.max(0, Math.min(w - tw, xx - tw / 2)); g.fillStyle = C.text; g.fillRect(tx, plotH + 2, tw, TIME_H - 4); g.fillStyle = C.bg; g.textAlign = 'center'; g.fillText(tl, tx + tw / 2, plotH + TIME_H / 2);
    }
    legendFor(hi_ >= 0 ? hi_ : candles.length - 1);
  }
  function line(g, vals, i0, i1, x, Y, color) {
    g.strokeStyle = color; g.beginPath(); let pen = false;
    for (let i = i0; i <= i1; i++) { const v = vals[i]; if (!Number.isFinite(v)) { pen = false; continue; } if (pen) g.lineTo(x(i), Y(v)); else { g.moveTo(x(i), Y(v)); pen = true; } }
    g.stroke();
  }
  function tag(g, text, x0, y, wd, bg, fg) { g.fillStyle = bg; g.fillRect(x0 + 1, y - 9, wd - 1, 18); g.fillStyle = fg; g.textAlign = 'left'; g.fillText(text, x0 + 8, y); }
  function axisTime(ms, dayTf) {
    const o = { h12: S.h12, utc: S.utc, dateFmt: S.dateFmt }, d = new Date(ms), mid = S.utc ? d.getUTCHours() === 0 && d.getUTCMinutes() === 0 : d.getHours() === 0 && d.getMinutes() === 0;
    if (dayTf || mid) { const s = L.fmtDate(ms, Object.assign(o, { dateOnly: true })); return o.dateFmt === 'iso' ? s.slice(5) : s.slice(0, 5); }
    return L.fmtDate(ms, Object.assign(o, { timeOnly: true }));
  }
  function readout(i) {
    const k = candles[i], ch = (k.c / k.o - 1) * 100;
    return { k, ch, time: fmtD(k.t, minutes >= 1440 ? { dateOnly: true } : {}) };
  }
  function legendFor(i) {
    const { k, ch } = readout(i), cls = k.c >= k.o ? 'up' : 'down', kv = (a, b, c) => el('span', null, a + ' ', el('b', { class: c || cls }, b));
    const mas = INDS.filter(([key]) => calc[key] && key !== 'rsi').map(([key, name, v]) => el('span', { style: `color:var(${v})` }, name + ' ' + pf(calc[key][i])));
    const rs = calc.rsi && Number.isFinite(calc.rsi[i]) ? el('span', { style: 'color:var(--violet)' }, 'RSI ' + calc.rsi[i].toFixed(1)) : null;
    legend.replaceChildren(el('div', null, kv('O', pf(k.o)), kv('H', pf(k.h)), kv('L', pf(k.l)), kv('C', pf(k.c)), el('b', { class: cls }, (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'),
      ind.vol ? kv(t('volShort'), L.fmtNum(k.v, k.v < 10 ? 3 : 1), 'dimv') : null), mas.length || rs ? el('div', null, mas, rs) : null);
  }
  function speak(i) { const { k, ch, time } = readout(i); said.textContent = t('candleSay', { t: time, o: pf(k.o), h: pf(k.h), l: pf(k.l), c: pf(k.c), ch: (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%' }); }

  // ---- interaction ----
  const local = (e) => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const zoom = (f, px) => { // keep the candle under px where it is
    const g0 = geo(), at = g0.right - (g0.w - px) / g0.cw; count = count * f; clamp();
    const cw = g0.w / count; off = candles.length - 1 + RIGHT_PAD - (at + (g0.w - px) / cw); clamp(); paint();
  };
  const ptrs = new Map(); let drag = null, pinch = null;
  box.addEventListener('wheel', (e) => { if (!candles.length) return; e.preventDefault(); zoom(Math.pow(1.0015, e.deltaY), Math.min(local(e)[0], width())); }, { passive: false });
  box.addEventListener('pointerdown', (e) => {
    if (!candles.length) return; box.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 1) drag = { x: local(e)[0], off, moved: false };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.abs(a[0] - b[0]) || 1, count, mid: (a[0] + b[0]) / 2 }; drag = null; }
  });
  box.addEventListener('pointermove', (e) => {
    if (!candles.length) return; const [px, py] = local(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.abs(a[0] - b[0]) || 1; const f = pinch.count * pinch.d / d / count; zoom(f, Math.min(pinch.mid, width())); return; }
    if (drag) { const dx = px - drag.x; if (Math.abs(dx) > 3) drag.moved = true; if (drag.moved) { off = drag.off + dx / geo().cw; clamp(); } }
    hover = px < width() ? geo().at(px) : -1; hoverY = py; paint();
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ptrs.size && document.activeElement !== box) { hover = -1; paint(); } });
  box.addEventListener('dblclick', () => { fit(); paint(); });
  box.addEventListener('focus', () => { if (!candles.length) return; if (hover < 0) hover = candles.length - 1; hoverY = NaN; paint(); speak(hover); });
  box.addEventListener('blur', () => { hover = -1; paint(); });
  box.addEventListener('keydown', (e) => {
    if (!candles.length) return; const n = candles.length;
    const move = { ArrowLeft: -1, ArrowRight: 1, PageUp: -10, PageDown: 10 }[e.key];
    if (move && e.shiftKey) { e.preventDefault(); off -= move * Math.max(1, Math.round(count / 10)); clamp(); paint(); return; }
    if (move) { e.preventDefault(); hover = Math.max(0, Math.min(n - 1, (hover < 0 ? n - 1 : hover) + move)); keepVisible(); hoverY = NaN; paint(); speak(hover); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); hover = e.key === 'Home' ? 0 : n - 1; keepVisible(); hoverY = NaN; paint(); speak(hover); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1 / 1.25, hover >= 0 ? geo().x(hover) : width()); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(1.25, hover >= 0 ? geo().x(hover) : width()); }
    else if (e.key === '0') { e.preventDefault(); fit(); paint(); }
  });
  function keepVisible() { const g0 = geo(), first = g0.right - count + 1; if (hover < first + 1) off += first + 1 - hover; else if (hover > g0.right - 1) off -= hover - (g0.right - 1); clamp(); }

  return panel;
}
