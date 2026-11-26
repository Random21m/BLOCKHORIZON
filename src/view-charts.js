// The live trading chart (trade-chart.js), then history charts: price, hashrate, difficulty, median fee rate, fees per block,
// their share of miner income and block size over 1 month, 1 year or all time.
// One range selector scopes them all. Each chart: latest value and change, a line with recessive grid, a crosshair
// tooltip (pointer and arrow keys), and a table view. Data is fetched when the page opens and kept for the session.
import * as L from './lib.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { S, st, save, fmtD, el, price } from './state.js';
import { kv } from './ui.js';
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
const blockFees = (r) => fetchOnce('bfee:' + r, () => api.blockFeeHistory(r));
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
  // what miners take in per block: the fees, the fees' share of the reward (subsidy + fees), and how full blocks are
  {
    id: 'blockfees',
    title: () => t('blkFeesChart'),
    load: (r) => blockFees(r).then(L.SERIES.blockFees),
    fmt: (v) => L.trimZeros(L.fmtNum(v, v < 1 ? 4 : 2)) + ' BTC',
    axis: (v) => L.trimZeros(L.fmtNum(v, v < 1 ? 3 : 1)),
    log: () => false,
    avg: { '1y': 7, all: 30 },
  },
  {
    id: 'feeshare',
    title: () => t('feeShareChart'),
    load: (r) =>
      Promise.all([blockFees(r), fetchOnce('brw:' + r, () => api.blockRewardHistory(r))]).then(([f, w]) =>
        L.feeShareSeries(f, w)
      ),
    fmt: (v) => L.fmtNum(v, v < 10 ? 2 : 1) + '%',
    change: false, // a % change of a share reads wrong; the line says enough
    axis: (v) => L.trimZeros(L.fmtNum(v, 1)) + '%',
    log: () => false,
    avg: { '1y': 7, all: 30 },
  },
  {
    id: 'blocksize',
    title: () => t('blkSizeChart'),
    load: (r) => fetchOnce('bsz:' + r, () => api.blockSizeHistory(r)).then(L.SERIES.blockSizes),
    fmt: (v) => L.fmtNum(v, 2) + ' MB',
    change: false, // from a few hundred bytes in 2009, the change over all time is a meaningless huge number
    axis: (v) => L.trimZeros(L.fmtNum(v, 1)) + ' MB',
    log: () => false,
    avg: { '1y': 7, all: 30 },
  },
];

// Long-term charts: always all time, from the price history (in the chosen currency) and the difficulty adjustments.
// Each build() returns the main line, optional extra lines and guides, and the line under the title.
const priceAll = () => fetchOnce('price:' + S.cur, () => api.priceHistory(S.cur)).then((x) => L.SERIES.price(x, S.cur));
const hrAll = () => fetchOnce('hr:all', () => api.hashrateHistory('all'));
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
    id: 'puell',
    title: () => t('chPuell'),
    build: async () => {
      const [price, r] = await Promise.all([priceAll(), hrAll()]);
      return { pts: L.puell(r, price), guides: [1], note: t('puellNote'), fmt: times, axis: times, log: true };
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
      const s = L.supplySeries(await hrAll()),
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
  // the ribbons show the last two years: over all time their lines would lie on top of each other
  {
    id: 'ribbons',
    title: () => t('chHashRibbons'),
    build: async () => {
      const hr = L.hashRibbons(await hrAll()),
        n30 = t('maDays', { n: 30 }),
        n60 = t('maDays', { n: 60 });
      return {
        pts: L.lastDays(hr.short, 730),
        name: n30,
        extra: [{ pts: L.lastDays(hr.long, 730), cls: 'c2', name: n60 }],
        legend: [
          [n30, ''],
          [n60, 'c2'],
        ],
        note: hr.long.length ? t(hr.down ? 'ribbonDown' : 'ribbonUp', { d: fmtD(hr.since, { dateOnly: true }) }) : '',
        fmt: L.fmtHashrate,
        axis: L.fmtHashrate,
        log: false,
        span: t('last2y'),
      };
    },
  },
  {
    id: 'diffribbon',
    title: () => t('chDiffRibbon'),
    build: async () => {
      const dr = L.diffRibbon(await hrAll()),
        k = dr.lines.length - 1;
      return {
        pts: L.lastDays(dr.diff, 730),
        name: t('diffChart'),
        // shortest average faint, longest strong; only those two are named in the tooltip
        extra: dr.lines.map((l, i) => ({
          pts: L.lastDays(l.pts, 730),
          cls: 'rib',
          op: (0.3 + (0.7 * i) / k).toFixed(2),
          name: i === 0 || i === k ? t('maDays', { n: l.days }) : '',
        })),
        legend: [
          [t('diffChart'), ''],
          [t('ribbonAvgs'), 'rib'],
        ],
        note: Number.isFinite(dr.spread) ? t('diffRibbonNote', { p: L.fmtNum(dr.spread, 1) }) : '',
        step: true, // difficulty changes only at each adjustment
        fmt: L.fmtDifficulty,
        axis: L.fmtDifficulty,
        log: false,
        span: t('last2y'),
      };
    },
  },
];
// Price and supply facts, first in the long-term section: the all-time high (in the chosen currency), how far below it
// the price is and since when, and the yearly inflation of the supply now and after the next halving.
function factsPanel() {
  const body = el('div', { class: 'cbody' }, el('p', { class: 'dim' }, t('loading')));
  // the height too: on a first visit the page can open before the app has it
  Promise.all([priceAll(), Number.isFinite(st.tip) ? st.tip : api.tip().then(Number, () => NaN)]).then(
    ([pts, tip]) => {
      const a = L.athFacts(pts, price()),
        h = Number.isFinite(st.tip) ? st.tip : tip,
        next = (Math.floor(h / L.EPOCH) + 1) * L.EPOCH,
        pct = (v) => (Number.isFinite(v) ? L.fmtNum(v, v < 10 ? 2 : 1) + '%' : '–');
      if (!a) return body.replaceChildren(el('p', { class: 'dim' }, t('noData')));
      body.replaceChildren(
        kv([
          [
            t('athL'),
            el(
              'span',
              null,
              el('b', null, money(a.ath)),
              ' ',
              el('span', { class: 'dim' }, fmtD(a.at, { dateOnly: true }))
            ),
          ],
          [t('belowAth'), a.now ? t('atAthNow') : '−' + pct(a.below)],
          [t('daysSinceAth'), a.now ? '0' : L.fmtNum(a.days)],
          [t('inflNow'), pct(L.inflationAt(h))],
          [t('inflNext', { h: L.fmtNum(next) }), pct(L.inflationAt(next))],
        ]),
        el('p', { class: 'dim note' }, t('factsNote'))
      );
    },
    () => body.replaceChildren(el('p', { class: 'dim' }, t('chartError')))
  );
  return el('section', { class: 'panel cpanel', id: 'ch-facts' }, el('h2', null, t('factsTitle')), body);
}
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
      d.span ? el('span', { class: 'dim clog' }, d.span) : null,
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
      step: d.step,
      fmt: d.fmt,
      axis: d.axis,
      timeFmt,
      name: d.name,
      extra,
      guides: d.guides,
      cls: d.cls,
      label: t('chartAria', { n: c.title(), r: d.span || t('rAll'), a: d.fmt(pts[0].v), b: d.fmt(last.v) }),
    }),
  ].filter(Boolean);
}

// The mempool over time, split by fee rate (mempool.space's statistics): its own range buttons, since its ranges are
// shorter than the history charts' (a day or a week says most about whether now is a good time to send).
const MP_RANGES = { '24h': 'r24h', '1w': 'r1w', '1m': 'r1m', '1y': 'r1y', all: 'rAll' };
const mvb = (v) => L.trimZeros(L.fmtNum(v / 1e6, v < 1e7 ? 1 : 0)) + ' MvB';
const bandText = (i) =>
  i < 0
    ? t('mpNextAll')
    : i === 0
      ? t('mpNextLow', { b: L.fmtNum(L.FEE_BREAKS[1]) })
      : i >= L.FEE_BREAKS.length - 1
        ? t('mpNextTop', { a: L.fmtNum(L.FEE_BREAKS[i]) })
        : t('mpNext', { a: L.fmtNum(L.FEE_BREAKS[i]), b: L.fmtNum(L.FEE_BREAKS[i + 1]) });
function mempoolPanel() {
  let range = MP_RANGES[S.mpRange] ? S.mpRange : '24h';
  const body = el('div', { class: 'cbody' }, el('p', { class: 'dim' }, t('loading'))),
    panel = el('section', { class: 'panel cpanel', id: 'ch-mempool' });
  const buttons = Object.keys(MP_RANGES).map((r) =>
    el(
      'button',
      {
        'data-m': r,
        'aria-pressed': String(r === range),
        onclick: () => {
          range = r;
          S.mpRange = r;
          save();
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === r)));
          load();
        },
      },
      t(MP_RANGES[r])
    )
  );
  // almost everything waiting can pay under 1 sat/vB (it may never be mined): leaving it out shows what competes for the
  // next blocks
  const low = el(
    'button',
    {
      class: 'mplow',
      'aria-pressed': String(!!S.mpLow),
      onclick: () => {
        S.mpLow = !S.mpLow;
        save();
        low.setAttribute('aria-pressed', String(S.mpLow));
        load();
      },
    },
    t('mpLow')
  );
  const load = () => {
    const r = range;
    panel.classList.add('busy');
    fetchOnce('mp:' + r, () => api.mempoolStats(r))
      .then((raw) => {
        if (r !== range) return;
        body.replaceChildren(...mempoolBody(L.mempoolHistory(raw, S.mpLow ? 0 : 1), r, S.mpLow ? 0 : 1));
        panel.classList.remove('busy');
      })
      .catch(() => {
        if (r !== range) return;
        body.replaceChildren(el('p', { class: 'dim' }, t('mpNone')));
        panel.classList.remove('busy');
      });
  };
  queueMicrotask(load);
  panel.append(
    el('h2', null, t('mpHist')),
    el(
      'div',
      { class: 'mpbar' },
      el('div', { class: 'tabs mprange', role: 'group', 'aria-label': t('rangeL') }, buttons),
      low
    ),
    body
  );
  return panel;
}
function mempoolBody(all, range, from) {
  const pts = L.thin(all, 300),
    layers = L.bandLayers(pts, from);
  if (pts.length < 2 || !layers.length) return [el('p', { class: 'dim' }, t('noData'))];
  const last = all[all.length - 1],
    rl = t(MP_RANGES[range]),
    timeFmt = (ms) => fmtD(ms, range === '24h' || range === '1w' ? {} : { dateOnly: true }),
    above = L.shareAbove(all, last.v);
  const head = el(
    'div',
    { class: 'chead' },
    el('b', { class: 'cval' }, mvb(last.v)),
    last.v > 1e6 ? el('span', { class: 'dim' }, t('mpBlocks', { n: L.fmtNum(Math.ceil(last.v / 1e6)) })) : null,
    el('span', { class: 'dim' }, bandText(L.nextBlockBand(last.b))),
    Number.isFinite(above)
      ? el(
          'span',
          { class: 'dim' },
          above >= 50
            ? t('mpEmptier', { p: L.fmtNum(Math.round(above)), r: rl })
            : t('mpFuller', { p: L.fmtNum(Math.round(100 - above)), r: rl })
        )
      : null
  );
  // the colours in use, lowest fee rate first, with the fee rates at both ends
  const lo = layers[0].band,
    hi = layers[layers.length - 1].band;
  const legend = el(
    'div',
    { class: 'mplegend', 'aria-hidden': 'true' },
    el('span', null, L.fmtNum(L.FEE_BREAKS[lo])),
    el(
      'span',
      { class: 'mpramp' },
      layers.map((ly) => el('i', { style: 'background:' + L.feeColor(L.FEE_BREAKS[ly.band]) }))
    ),
    el('span', null, L.fmtNum(L.FEE_BREAKS[hi]) + (hi >= L.FEE_BREAKS.length - 1 ? '+' : '') + ' sat/vB')
  );
  const table = el(
    'details',
    { class: 'ctable' },
    el('summary', null, t('showTable')),
    el(
      'table',
      null,
      el(
        'thead',
        null,
        el('tr', null, el('th', null, t('dateL')), el('th', null, t('valueL')), el('th', null, t('mpNextL')))
      ),
      el(
        'tbody',
        null,
        L.thin(all, 13)
          .slice()
          .reverse()
          .map((p) => {
            const i = L.nextBlockBand(p.b);
            return el(
              'tr',
              null,
              el('td', null, timeFmt(p.t)),
              el('td', { class: 'num' }, mvb(p.v)),
              el('td', { class: 'num' }, i < 0 ? '–' : L.fmtNum(L.FEE_BREAKS[i]) + '+')
            );
          })
      )
    )
  );
  return [
    head,
    el('p', { class: 'dim mpnote' }, t('mpNote')),
    legend,
    lineChart(pts, {
      zero: true,
      fmt: mvb,
      axis: mvb,
      timeFmt,
      guides: [1e6],
      cls: 'mptotal',
      layers: layers.map((ly) => ({ top: ly.top, fill: L.feeColor(L.FEE_BREAKS[ly.band]) })),
      more: (i) => [bandText(L.nextBlockBand(pts[i].b))],
      label: t('chartAria', { n: t('mpHist'), r: rl, a: mvb(pts[0].v), b: mvb(last.v) }),
    }),
    table,
  ];
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
    mempoolPanel(),
    el('h2', { class: 'hist' }, t('longTermL')),
    el('p', { class: 'dim' }, t('longTermIntro')),
    el('div', { class: 'chartgrid long' }, factsPanel(), longPanels)
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
    Number.isFinite(ch) && c.change !== false
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
  {
    log,
    step,
    fmt,
    axis,
    timeFmt,
    label,
    name: label0 = '',
    extra = [],
    guides = [],
    cls = '',
    zero,
    layers = [],
    more,
  }
) {
  const vs = pts.map((p) => p.v).concat(...extra.map((x) => x.pts.map((p) => p.v)), guides),
    lo0 = Math.min(...vs),
    hi0 = Math.max(...vs),
    useLog = log && lo0 > 0;
  let lo = lo0,
    hi = hi0;
  if (!useLog) {
    const pad = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.1 || 1;
    lo = zero ? 0 : lo0 >= 0 ? Math.max(0, lo0 - pad) : lo0 - pad;
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
    // stacked areas (their top edges, aligned with pts): each filled down to the one below
    layers
      .map((ly, k) => {
        const below = k ? layers[k - 1].top : pts.map(() => 0),
          d =
            pts.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(2) + ' ' + Y(ly.top[i]).toFixed(2)).join('') +
            pts
              .map((p, i) => pts.length - 1 - i)
              .map((i) => 'L' + X(pts[i].t).toFixed(2) + ' ' + Y(below[i]).toFixed(2))
              .join('') +
            'Z';
        return `<path class="area" fill="${ly.fill}" d="${d}"/>`;
      })
      .join('') +
    extra
      .map(
        (x) =>
          `<path class="ln ${x.cls}"${x.op ? ` stroke-opacity="${x.op}"` : ''} vector-effect="non-scaling-stroke" d="${path(x.pts)}"/>`
      )
      .join('') +
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
    // the other named lines at the same moment (when they reach it)
    const others = extra
      .map((x) => {
        const q = x.pts[L.nearest(x.pts, p.t)];
        return x.name && q && Math.abs(q.t - p.t) <= 8 * 864e5 ? x.name + ': ' + fmt(q.v) : '';
      })
      .filter(Boolean)
      .concat(more ? more(cur) : []);
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
