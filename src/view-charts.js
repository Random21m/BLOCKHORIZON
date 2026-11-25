// History charts: price, hashrate, difficulty and median fee rate over 1 month, 1 year or all time.
// One range selector scopes all four. Each chart: latest value and change, a line with recessive grid, a crosshair
// tooltip (pointer and arrow keys), and a table view. Data is fetched when the page opens and kept for the session.
import * as L from './lib.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { S, save, fmtD, el } from './state.js';

const NS = 'http://www.w3.org/2000/svg';
const cache = new Map(); // request key -> promise, for this session (price history is large: never put in localStorage)
const fetchOnce = (key, fn) => { if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; })); return cache.get(key); };
const RANGE_KEYS = { '1m': 'r1m', '1y': 'r1y', all: 'rAll' };
const short = (v) => (v >= 1000 ? L.compact(v) : L.fmtNum(v, v < 10 ? 2 : 0));
const CHARTS = [
  { id: 'price', title: () => t('price') + ' (' + S.cur + ')', load: (r) => fetchOnce('price:' + S.cur, () => api.priceHistory(S.cur)).then((x) => L.inRange(L.SERIES.price(x, S.cur), r)),
    fmt: (v) => L.fmtNum(v, v < 100 ? 2 : 0) + ' ' + S.cur, axis: short, log: (r) => r === 'all' },
  { id: 'hashrate', title: () => t('hashrate'), load: (r) => fetchOnce('hr:' + r, () => api.hashrateHistory(r)).then(L.SERIES.hashrate), fmt: L.fmtHashrate, axis: L.fmtHashrate, log: (r) => r === 'all', avg: { '1y': 7, all: 30 } },
  { id: 'difficulty', title: () => t('diffChart'), load: (r) => fetchOnce('hr:' + r, () => api.hashrateHistory(r)).then(L.SERIES.difficulty), fmt: L.fmtDifficulty, axis: L.fmtDifficulty, log: (r) => r === 'all', step: true }, // difficulty only changes at each adjustment
  { id: 'fees', title: () => t('feeChart'), load: (r) => fetchOnce('fee:' + r, () => api.feeHistory(r)).then(L.SERIES.fees), fmt: (v) => L.fmtFee(v) + ' sat/vB', axis: (v) => L.fmtFee(v), log: () => false, avg: { '1m': 1, '1y': 7, all: 30 } },
];

export function viewCharts() {
  let range = RANGE_KEYS[S.chartRange] ? S.chartRange : '1y';
  const panels = CHARTS.map((c) => el('section', { class: 'panel cpanel', id: 'ch-' + c.id }, el('h2', null, c.title()), el('div', { class: 'cbody' }, el('p', { class: 'dim' }, t('loading')))));
  const buttons = Object.keys(RANGE_KEYS).map((r) => el('button', { 'data-r': r, 'aria-pressed': String(r === range), onclick: () => { range = r; S.chartRange = r; save(); buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === r))); load(); } }, t(RANGE_KEYS[r])));
  const load = () => CHARTS.forEach((c, i) => {
    const p = panels[i], r = range; p.classList.add('busy'); // the previous chart stays, faded, until the new one is ready
    c.load(r).then((pts) => { if (r === range) { p.querySelector('.cbody').replaceChildren(...chartBody(c, L.thin(L.smoothDays(pts, (c.avg || {})[r]), 400), r)); p.classList.remove('busy'); } })
      .catch(() => { if (r === range) { p.querySelector('.cbody').replaceChildren(el('p', { class: 'dim' }, t('chartError'))); p.classList.remove('busy'); } });
  });
  queueMicrotask(load);
  return el('div', null, el('h1', null, t('charts').toUpperCase()), el('p', { class: 'dim' }, t('chartsIntro')),
    el('div', { class: 'tabs range', role: 'group', 'aria-label': t('rangeL') }, buttons), el('div', { class: 'chartgrid' }, panels));
}

function chartBody(c, pts, range) {
  if (pts.length < 2) return [el('p', { class: 'dim' }, t('noData'))];
  const first = pts[0], last = pts[pts.length - 1], rl = t(RANGE_KEYS[range]), log = c.log(range);
  const ch = first.v > 0 ? (last.v / first.v - 1) * 100 : NaN, timeFmt = (ms) => fmtD(ms, range === '1m' ? {} : { dateOnly: true });
  const head = el('div', { class: 'chead' }, el('b', { class: 'cval' }, c.fmt(last.v)),
    Number.isFinite(ch) ? el('span', { class: 'dim' }, t('overRange', { c: (ch >= 0 ? '▲ +' : '▼ ') + ch.toFixed(1) + '%', r: rl })) : null,
    (c.avg || {})[range] ? el('span', { class: 'dim clog' }, t('avgDays', { n: c.avg[range] })) : null, log ? el('span', { class: 'dim clog' }, t('logScale')) : null);
  const table = el('details', { class: 'ctable' }, el('summary', null, t('showTable')), el('table', null,
    el('thead', null, el('tr', null, el('th', null, t('dateL')), el('th', null, t('valueL')))),
    el('tbody', null, L.thin(pts, 13).slice().reverse().map((p) => el('tr', null, el('td', null, timeFmt(p.t)), el('td', { class: 'num' }, c.fmt(p.v)))))));
  return [head, lineChart(pts, { log, step: c.step, fmt: c.fmt, axis: c.axis, timeFmt, label: t('chartAria', { n: c.title(), r: rl, a: c.fmt(first.v), b: c.fmt(last.v) }) }), table];
}

// A single-series line chart. The SVG only draws the line and grid (stretched to the box); all text is HTML so it never distorts.
function lineChart(pts, { log, step, fmt, axis, timeFmt, label }) {
  const vs = pts.map((p) => p.v), lo0 = Math.min(...vs), hi0 = Math.max(...vs), useLog = log && lo0 > 0;
  let lo = lo0, hi = hi0;
  if (!useLog) { const pad = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.1 || 1; lo = lo0 >= 0 ? Math.max(0, lo0 - pad) : lo0 - pad; hi = hi0 + pad; }
  const f = useLog ? Math.log10 : (x) => x, fl = f(lo), span = f(hi) - fl || 1, t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const X = (tm) => (tm - t0) / (t1 - t0 || 1) * 100, Y = (v) => (1 - (f(Math.max(v, useLog ? lo : -Infinity)) - fl) / span) * 100;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  const tk = L.ticks(lo, hi, useLog).filter((v) => Y(v) >= 0 && Y(v) <= 100);
  svg.innerHTML = tk.map((v) => `<line class="grid" x1="0" x2="100" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}" vector-effect="non-scaling-stroke"/>`).join('')
    + `<path class="ln" vector-effect="non-scaling-stroke" d="${pts.map((p, i) => (i ? (step ? 'H' + X(p.t).toFixed(2) + 'V' : 'L' + X(p.t).toFixed(2) + ' ') : 'M' + X(p.t).toFixed(2) + ' ') + Y(p.v).toFixed(2)).join('')}"/>`;
  const xh = el('div', { class: 'xh', hidden: true }), dot = el('div', { class: 'xd', hidden: true }), tip = el('div', { class: 'tip', hidden: true }), said = el('span', { class: 'sr-only', 'aria-live': 'polite' });
  const plot = el('div', { class: 'plot' }, svg, tk.map((v) => el('span', { class: 'ylab', style: `top:${Y(v).toFixed(2)}%` }, axis(v))), xh, dot, tip);
  let cur = -1;
  const show = (i, speak) => {
    cur = Math.max(0, Math.min(pts.length - 1, i)); const p = pts[cur], x = X(p.t), y = Y(p.v);
    xh.style.left = x + '%'; dot.style.left = x + '%'; dot.style.top = y + '%'; tip.style.left = x + '%';
    tip.style.transform = `translate(${x < 18 ? '0' : x > 82 ? '-100%' : '-50%'}, -100%)`;
    tip.replaceChildren(el('b', null, fmt(p.v)), el('span', null, timeFmt(p.t))); xh.hidden = dot.hidden = tip.hidden = false;
    if (speak) said.textContent = fmt(p.v) + ', ' + timeFmt(p.t);
  };
  const hide = () => { xh.hidden = dot.hidden = tip.hidden = true; };
  const at = (e) => { const r = plot.getBoundingClientRect(); return L.nearest(pts, t0 + (e.clientX - r.left) / r.width * (t1 - t0)); };
  plot.addEventListener('pointermove', (e) => show(at(e))); plot.addEventListener('pointerdown', (e) => show(at(e)));
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== box) hide(); });
  const box = el('div', { class: 'lchart', tabindex: 0, role: 'group', 'aria-roledescription': 'chart', 'aria-label': label + ' ' + t('chartKeys'),
    onfocus: () => show(cur < 0 ? pts.length - 1 : cur, true), onblur: hide,
    onkeydown: (e) => { const d = { ArrowLeft: -1, ArrowRight: 1, PageDown: -10, PageUp: 10 }[e.key]; if (d) { e.preventDefault(); show(cur + (e.shiftKey ? d * 10 : d), true); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); show(e.key === 'Home' ? 0 : pts.length - 1, true); } } },
  plot, el('div', { class: 'xlabs', 'aria-hidden': 'true' }, el('span', null, timeFmt(t0)), el('span', null, timeFmt(t0 + (t1 - t0) / 2)), el('span', null, timeFmt(t1))), said);
  return box;
}
