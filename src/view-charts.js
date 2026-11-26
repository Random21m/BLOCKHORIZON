// The live trading chart (trade-chart.js), then history charts: price, hashrate, difficulty and median fee rate over 1 month, 1 year or all time.
// One range selector scopes all four. Each chart: latest value and change, a line with recessive grid, a crosshair
// tooltip (pointer and arrow keys), and a table view. Data is fetched when the page opens and kept for the session.
import * as L from './lib.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { S, save, fmtD, el } from './state.js';
import { tradeChart } from './trade-chart.js';

const NS = 'http://www.w3.org/2000/svg';
const cache = new Map(); // request key -> promise, for this session (price history is large: never put in localStorage)
const fetchOnce = (key, fn) => {
  if (!cache.has(key))
    cache.set(
      key,
      fn().catch((e) => {
        cache.delete(key);
        throw e;
      })
    );
  return cache.get(key);
};
const RANGE_KEYS = { '1m': 'r1m', '1y': 'r1y', all: 'rAll' };
const short = (v) => (v >= 1000 ? L.compact(v) : L.fmtNum(v, v < 10 ? 2 : 0));
const CHARTS = [
  {
    id: 'price',
    title: () => t('price') + ' (' + S.cur + ')',
    load: (r) =>
      fetchOnce('price:' + S.cur, () => api.priceHistory(S.cur)).then((x) => L.inRange(L.SERIES.price(x, S.cur), r)),
    fmt: (v) => L.fmtNum(v, v < 100 ? 2 : 0) + ' ' + S.cur,
    axis: short,
    log: (r) => r === 'all',
  },
  {
    id: 'hashrate',
    title: () => t('hashrate'),
    load: (r) => fetchOnce('hr:' + r, () => api.hashrateHistory(r)).then(L.SERIES.hashrate),
    fmt: L.fmtHashrate,
    axis: L.fmtHashrate,
    log: (r) => r === 'all',
    avg: { '1y': 7, all: 30 },
  },
  {
    id: 'difficulty',
    title: () => t('diffChart'),
    load: (r) => fetchOnce('hr:' + r, () => api.hashrateHistory(r)).then(L.SERIES.difficulty),
    fmt: L.fmtDifficulty,
    axis: L.fmtDifficulty,
    log: (r) => r === 'all',
    step: true,
  }, // difficulty only changes at each adjustment
  {
    id: 'fees',
    title: () => t('feeChart'),
    load: (r) => fetchOnce('fee:' + r, () => api.feeHistory(r)).then(L.SERIES.fees),
    fmt: (v) => L.fmtFee(v) + ' sat/vB',
    axis: (v) => L.fmtFee(v),
    log: () => false,
    avg: { '1m': 1, '1y': 7, all: 30 },
  },
];

// Long-term charts: always all time, from the price history (in the chosen currency) and the difficulty adjustments.
// Each build() returns the main line, optional extra lines and guides, and the line under the title.
const priceAll = () => fetchOnce('price:' + S.cur, () => api.priceHistory(S.cur)).then((x) => L.SERIES.price(x, S.cur));
const money = (v) => L.fmtNum(v, v < 100 ? 2 : 0) + ' ' + S.cur;
const times = (v) => '×' + L.trimZeros(L.fmtNum(v, v < 10 ? 2 : 0));
const CYCLE_CLS = { 2012: 'c1', 2016: 'c2', 2020: 'c3', 2024: 'c4' };
const LONG = [
  {
    id: 'ma200w',
    title: () => t('ch200w') + ' (' + S.cur + ')',
    build: async () => {
      const price = await priceAll(),
        wma = L.ma200w(price),
        from = wma.length ? wma[0].t : Infinity,
        last = price[price.length - 1];
      return {
        pts: price.filter((p) => p.t >= from),
        name: t('price'),
        extra: [{ pts: wma, cls: 'c2', name: t('ch200w') }],
        head: wma.length ? wma[wma.length - 1].v : NaN,
        note: wma.length ? t('ma200wNote', { x: times(last.v / wma[wma.length - 1].v) }) : '',
        fmt: money,
        axis: short,
        log: true,
      };
    },
  },
  {
    id: 'mayer',
    title: () => t('chMayer'),
    build: async () => {
      const m = L.mayer(await priceAll());
      return { pts: m, guides: [1], note: t('mayerNote'), fmt: times, axis: times, log: true };
    },
  },
  {
    id: 'cycles',
    title: () => t('chCycles'),
    build: async () => {
      const cs = L.halvingCycles(await priceAll());
      if (!cs.length) return { pts: [] };
      const main = cs.reduce((a, c) => (c.pts.length > a.pts.length ? c : a)),
        now = cs[cs.length - 1];
      return {
        pts: main.pts,
        cls: CYCLE_CLS[main.year],
        name: t('cycleName', { y: main.year }),
        extra: cs
          .filter((c) => c !== main)
          .map((c) => ({ pts: c.pts, cls: CYCLE_CLS[c.year] || 'c1', name: t('cycleName', { y: c.year }) })),
        legend: cs.map((c) => [t('cycleName', { y: c.year }), CYCLE_CLS[c.year] || 'c1']),
        note: t('cyclesNote', { x: times(now.pts[now.pts.length - 1].v), y: now.year }),
        guides: [1],
        fmt: times,
        axis: times,
        log: true,
        days: true,
      };
    },
  },
  {
    id: 'supply',
    title: () => t('chSupply'),
    build: async () => {
      const s = L.supplySeries(await fetchOnce('hr:all', () => api.hashrateHistory('all'))),
        last = s[s.length - 1];
      return {
        pts: s,
        guides: [21e6],
        note: last ? t('supplyNote', { p: L.fmtNum((last.v / 21e6) * 100, 2) }) : '',
        fmt: (v) => L.fmtNum(v, 0) + ' BTC',
        axis: (v) => L.compact(v),
        log: false,
      };
    },
  },
];
function longBody(c, d) {
  const pts = L.thin(d.pts || [], 400);
  if (pts.length < 2) return [el('p', { class: 'dim' }, t('noData'))];
  const extra = (d.extra || []).map((x) => Object.assign({}, x, { pts: L.thin(x.pts, 400) })),
    timeFmt = d.days
      ? (ms) => t('dayN', { n: L.fmtNum(Math.round(ms / 864e5)) })
      : (ms) => fmtD(ms, { dateOnly: true }),
    last = pts[pts.length - 1];
  return [
    el(
      'div',
      { class: 'chead' },
      d.days ? null : el('b', { class: 'cval' }, d.fmt(Number.isFinite(d.head) ? d.head : last.v)),
      d.note ? el('span', { class: 'dim' }, d.note) : null,
      d.log ? el('span', { class: 'dim clog' }, t('logScale')) : null
    ),
    d.legend
      ? el(
          'div',
          { class: 'clegend', 'aria-hidden': 'true' },
          d.legend.map(([n, cls]) => el('span', { class: cls }, n))
        )
      : null,
    lineChart(pts, {
      log: d.log,
      fmt: d.fmt,
      axis: d.axis,
      timeFmt,
      name: d.name,
      extra,
      guides: d.guides,
      cls: d.cls,
      label: t('chartAria', { n: c.title(), r: t('rAll'), a: d.fmt(pts[0].v), b: d.fmt(last.v) }),
    }),
  ].filter(Boolean);
}

export function viewCharts() {
  let range = RANGE_KEYS[S.chartRange] ? S.chartRange : '1y';
  const panels = CHARTS.map((c) =>
    el(
      'section',
      { class: 'panel cpanel', id: 'ch-' + c.id },
      el('h2', null, c.title()),
      el('div', { class: 'cbody' }, el('p', { class: 'dim' }, t('loading')))
    )
  );
  const buttons = Object.keys(RANGE_KEYS).map((r) =>
    el(
      'button',
      {
        'data-r': r,
        'aria-pressed': String(r === range),
        onclick: () => {
          range = r;
          S.chartRange = r;
          save();
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === r)));
          load();
        },
      },
      t(RANGE_KEYS[r])
    )
  );
  const load = () =>
    CHARTS.forEach((c, i) => {
      const p = panels[i],
        r = range;
      p.classList.add('busy'); // the previous chart stays, faded, until the new one is ready
      c.load(r)
        .then((pts) => {
          if (r === range) {
            p.querySelector('.cbody').replaceChildren(
              ...chartBody(c, L.thin(L.smoothDays(pts, (c.avg || {})[r]), 400), r)
            );
            p.classList.remove('busy');
          }
        })
        .catch(() => {
          if (r === range) {
            p.querySelector('.cbody').replaceChildren(el('p', { class: 'dim' }, t('chartError')));
            p.classList.remove('busy');
          }
        });
    });
  queueMicrotask(load);
  // the long-term charts do not follow the range buttons: they are always all time
  const longPanels = LONG.map((c) => {
    const body = el('div', { class: 'cbody' }, el('p', { class: 'dim' }, t('loading')));
    c.build().then(
      (d) => body.replaceChildren(...longBody(c, d)),
      () => body.replaceChildren(el('p', { class: 'dim' }, t('chartError')))
    );
    return el('section', { class: 'panel cpanel', id: 'ch-' + c.id }, el('h2', null, c.title()), body);
  });
  return el(
    'div',
    null,
    el('h1', null, t('charts').toLocaleUpperCase(document.documentElement.lang)),
    el('p', { class: 'dim' }, t('chartsIntro')),
    tradeChart(),
    el('h2', { class: 'hist' }, t('historyL')),
    el('div', { class: 'tabs range', role: 'group', 'aria-label': t('rangeL') }, buttons),
    el('div', { class: 'chartgrid' }, panels),
    el('h2', { class: 'hist' }, t('longTermL')),
    el('p', { class: 'dim' }, t('longTermIntro')),
    el('div', { class: 'chartgrid long' }, longPanels)
  );
}

function chartBody(c, pts, range) {
  if (pts.length < 2) return [el('p', { class: 'dim' }, t('noData'))];
  const first = pts[0],
    last = pts[pts.length - 1],
    rl = t(RANGE_KEYS[range]),
    log = c.log(range);
  const ch = first.v > 0 ? (last.v / first.v - 1) * 100 : NaN,
    timeFmt = (ms) => fmtD(ms, range === '1m' ? {} : { dateOnly: true });
  const head = el(
    'div',
    { class: 'chead' },
    el('b', { class: 'cval' }, c.fmt(last.v)),
    Number.isFinite(ch)
      ? el('span', { class: 'dim' }, t('overRange', { c: (ch >= 0 ? '▲ +' : '▼ ') + ch.toFixed(1) + '%', r: rl }))
      : null,
    (c.avg || {})[range] ? el('span', { class: 'dim clog' }, t('avgDays', { n: c.avg[range] })) : null,
    log ? el('span', { class: 'dim clog' }, t('logScale')) : null
  );
  const table = el(
    'details',
    { class: 'ctable' },
    el('summary', null, t('showTable')),
    el(
      'table',
      null,
      el('thead', null, el('tr', null, el('th', null, t('dateL')), el('th', null, t('valueL')))),
      el(
        'tbody',
        null,
        L.thin(pts, 13)
          .slice()
          .reverse()
          .map((p) => el('tr', null, el('td', null, timeFmt(p.t)), el('td', { class: 'num' }, c.fmt(p.v))))
      )
    )
  );
  return [
    head,
    lineChart(pts, {
      log,
      step: c.step,
      fmt: c.fmt,
      axis: c.axis,
      timeFmt,
      label: t('chartAria', { n: c.title(), r: rl, a: c.fmt(first.v), b: c.fmt(last.v) }),
    }),
    table,
  ];
}

// A line chart. The SVG only draws the lines and grid (stretched to the box); all text is HTML so it never distorts.
// `pts` is the main series (the crosshair and keys follow it); `extra` are more lines ({ pts, cls, name }) shown in the
// tooltip by name, and `guides` are values marked with a dashed line (such as 1 for a ratio).
function lineChart(
  pts,
  { log, step, fmt, axis, timeFmt, label, name: label0 = '', extra = [], guides = [], cls = '' }
) {
  const vs = pts.map((p) => p.v).concat(...extra.map((x) => x.pts.map((p) => p.v)), guides),
    lo0 = Math.min(...vs),
    hi0 = Math.max(...vs),
    useLog = log && lo0 > 0;
  let lo = lo0,
    hi = hi0;
  if (!useLog) {
    const pad = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.1 || 1;
    lo = lo0 >= 0 ? Math.max(0, lo0 - pad) : lo0 - pad;
    hi = hi0 + pad;
  }
  const f = useLog ? Math.log10 : (x) => x,
    fl = f(lo),
    span = f(hi) - fl || 1,
    t0 = Math.min(pts[0].t, ...extra.map((x) => x.pts[0].t)),
    t1 = Math.max(pts[pts.length - 1].t, ...extra.map((x) => x.pts[x.pts.length - 1].t));
  const path = (ps) =>
    ps
      .map(
        (p, i) =>
          (i ? (step ? 'H' + X(p.t).toFixed(2) + 'V' : 'L' + X(p.t).toFixed(2) + ' ') : 'M' + X(p.t).toFixed(2) + ' ') +
          Y(p.v).toFixed(2)
      )
      .join('');
  const X = (tm) => ((tm - t0) / (t1 - t0 || 1)) * 100,
    Y = (v) => (1 - (f(Math.max(v, useLog ? lo : -Infinity)) - fl) / span) * 100;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const tk = L.ticks(lo, hi, useLog).filter((v) => Y(v) >= 0 && Y(v) <= 100);
  svg.innerHTML =
    tk
      .map(
        (v) =>
          `<line class="grid" x1="0" x2="100" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}" vector-effect="non-scaling-stroke"/>`
      )
      .join('') +
    guides
      .map(
        (v) =>
          `<line class="guide" x1="0" x2="100" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}" vector-effect="non-scaling-stroke"/>`
      )
      .join('') +
    extra.map((x) => `<path class="ln ${x.cls}" vector-effect="non-scaling-stroke" d="${path(x.pts)}"/>`).join('') +
    `<path class="ln ${cls}" vector-effect="non-scaling-stroke" d="${path(pts)}"/>`;
  const xh = el('div', { class: 'xh', hidden: true }),
    dot = el('div', { class: 'xd', hidden: true }),
    tip = el('div', { class: 'tip', hidden: true }),
    said = el('span', { class: 'sr-only', 'aria-live': 'polite' });
  const plot = el(
    'div',
    { class: 'plot' },
    svg,
    tk.map((v) => el('span', { class: 'ylab', style: `top:${Y(v).toFixed(2)}%` }, L.trimZeros(axis(v)))),
    xh,
    dot,
    tip
  );
  let cur = -1;
  const show = (i, speak) => {
    cur = Math.max(0, Math.min(pts.length - 1, i));
    const p = pts[cur],
      x = X(p.t),
      y = Y(p.v);
    xh.style.left = x + '%';
    dot.style.left = x + '%';
    dot.style.top = y + '%';
    tip.style.left = x + '%';
    tip.style.transform = `translate(${x < 18 ? '0' : x > 82 ? '-100%' : '-50%'}, -100%)`;
    // the other lines at the same moment (when they reach it)
    const others = extra
      .map((x) => {
        const q = x.pts[L.nearest(x.pts, p.t)];
        return q && Math.abs(q.t - p.t) <= 8 * 864e5 ? x.name + ': ' + fmt(q.v) : '';
      })
      .filter(Boolean);
    tip.replaceChildren(
      el('b', null, (extra.length && label0 ? label0 + ': ' : '') + fmt(p.v)),
      ...others.map((o) => el('span', null, o)),
      el('span', null, timeFmt(p.t))
    );
    xh.hidden = dot.hidden = tip.hidden = false;
    if (speak) said.textContent = [fmt(p.v)].concat(others, timeFmt(p.t)).join(', ');
  };
  const hide = () => {
    xh.hidden = dot.hidden = tip.hidden = true;
  };
  const at = (e) => {
    const r = plot.getBoundingClientRect();
    return L.nearest(pts, t0 + ((e.clientX - r.left) / r.width) * (t1 - t0));
  };
  plot.addEventListener('pointermove', (e) => show(at(e)));
  plot.addEventListener('pointerdown', (e) => show(at(e)));
  plot.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && document.activeElement !== box) hide();
  });
  const box = el(
    'div',
    {
      class: 'lchart',
      tabindex: 0,
      role: 'group',
      'aria-roledescription': 'chart',
      'aria-label': label + ' ' + t('chartKeys'),
      onfocus: () => show(cur < 0 ? pts.length - 1 : cur, true),
      onblur: hide,
      onkeydown: (e) => {
        const d = { ArrowLeft: -1, ArrowRight: 1, PageDown: -10, PageUp: 10 }[e.key];
        if (d) {
          e.preventDefault();
          show(cur + (e.shiftKey ? d * 10 : d), true);
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          show(e.key === 'Home' ? 0 : pts.length - 1, true);
        }
      },
    },
    plot,
    el(
      'div',
      { class: 'xlabs', 'aria-hidden': 'true' },
      el('span', null, timeFmt(t0)),
      el('span', null, timeFmt(t0 + (t1 - t0) / 2)),
      el('span', null, timeFmt(t1))
    ),
    said
  );
  return box;
}
