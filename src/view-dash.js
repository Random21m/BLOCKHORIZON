// The dashboard and clock mode (repainted in place on every live update).
import * as L from './lib.js';
import { t } from './i18n.js';
import { S, st, fmtD, el, price, dashTiles, tileOn } from './state.js';
import {
  bar,
  arc,
  spark,
  gapsChart,
  emissionChart,
  stack,
  feeBands,
  minis,
  less,
  minedCube,
  upcomingCube,
  more,
  pct24,
  tile,
  priceLine,
  sinceText,
} from './ui.js';

// '11 fast · 3 slow · target 10m': the target part is dropped on narrow tiles, where it was cut off in longer languages
const fastSlow = (x) => {
  const p = x.split(' · ');
  return p.length > 2 ? [more(x), less(p.slice(0, -1).join(' · '))] : x;
};
export function viewDash() {
  const h = st.tip,
    now = Date.now(),
    root = el('div', { class: 'dashgrid' }, el('h1', { class: 'sr-only' }, 'BLOCKHORIZON')),
    p = price();
  const hv = Number.isFinite(h) ? L.halvingInfo(h, now) : null,
    sp = Number.isFinite(h) ? L.supplyAt(h) : NaN;
  root.append(
    el(
      'section',
      { class: 'tile hero' },
      el('div', { class: 'eyebrow' }, t('height')),
      el('div', { class: 'height', id: 'h' }, L.fmtNum(h)),
      el('div', { class: 'since' }, t('since') + ': ', el('b', { id: 'since' }, sinceText(now))),
      priceLine()
    )
  );
  const make = {
    halving: () =>
      hv &&
      tile(
        't-halving',
        t('halving'),
        [more(L.fmtNum(hv.blocksToGo) + ' ' + t('blocksToGo')), less(t('nBlocks', { n: L.fmtNum(hv.blocksToGo) }))],
        [[t('est', { d: fmtD(hv.estMs, { dateOnly: true }) }), more(t('atBlock', { n: L.fmtNum(hv.nextHeight) }))]],
        arc(hv.progress, (hv.progress * 100).toFixed(0) + '%', t('ofEpoch'))
      ),
    diff: () => {
      if (!st.diff) return null;
      const d = L.parseDifficulty(st.diff);
      return tile(
        't-diff',
        [t('difficulty'), t('diffShort')],
        (d.change >= 0 ? '+' : '') + L.fmtNum(d.change, 2) + '%',
        [
          [
            more(t('nBlocks', { n: L.fmtNum(d.blocksLeft) })),
            more(t('estAt', { d: fmtD(d.estMs) })),
            less(t('est', { d: fmtD(d.estMs, { dateOnly: true }) })),
          ],
        ],
        arc(d.progress, (d.progress * 100).toFixed(0) + '%', t('ofPeriod'))
      );
    },
    hash: () => {
      if (!st.hr) return null;
      const a = L.hashrateAverages(st.hr.hashrates, st.hr.currentHashrate),
        sel = S.hr || 'd14',
        lab = { d7: '7d', d14: '14d', d30: '30d', d90: '90d' }[sel];
      return tile(
        't-hash',
        t('hashrate'),
        L.fmtHashrate(a.current),
        [t('avgOf', { p: lab, v: L.fmtHashrate(a[sel]) })],
        spark((st.hr.hashrates || []).slice(-120).map((x) => x.avgHashrate))
      );
    },
    supply: () =>
      hv &&
      tile(
        't-supply',
        [t('supply'), t('supplyShort')],
        L.fmtNum(sp / 1e14, 3) + 'M BTC',
        [
          [
            t('issued', { p: L.fmtNum((sp / L.MAX_SATS) * 100, 2) }),
            more(t('btcLeft', { n: L.fmtNum((L.MAX_SATS - sp) / 1e8, 0) })),
          ],
        ],
        [bar(sp / L.MAX_SATS), emissionChart(hv.epoch)]
      ),
    last: () => {
      if (!st.blocks[0]) return null;
      const b = L.parseBlock(st.blocks[0]),
        x0 = st.blocks[0];
      return tile(
        't-last',
        t('last'),
        el('a', { href: '#/block/' + b.height }, '#' + L.fmtNum(b.height)),
        [
          [
            `${L.fmtNum(b.txs)} tx · ${L.fmtNum(x0.size / 1e6, 2)} MB`,
            S.showPool && b.pool ? more(' · ' + b.pool) : null,
          ],
        ],
        el(
          'div',
          { class: 'lastviz' },
          el('div', { class: 'bigcube' }, minedCube(x0)),
          el(
            'div',
            { class: 'fillnote' },
            t('full', { p: Math.round((x0.weight || 0) / 4e4) }),
            el('div', { class: 'stripe', style: `background:${L.feeStripes(b.feeRange)}` }),
            el(
              'small',
              null,
              b.feeRange.length
                ? t('feesRange', { a: L.fmtFee(b.feeRange[0]), b: L.fmtFee(b.feeRange[b.feeRange.length - 1]) })
                : ''
            )
          )
        )
      );
    },
    prod: () => {
      if (st.blocks.length < 2) return null;
      const bs = L.blockTimeStats(st.blocks, now / 1000);
      return tile(
        't-prod',
        [t('production'), t('prodShort')],
        L.fmtDuration(bs.avg),
        [fastSlow(t('fastSlow', { f: bs.fast, s: bs.slow }))],
        gapsChart(st.blocks)
      );
    },
    fees: () => {
      if (!st.fees) return null;
      const f = st.fees,
        cells = [
          [f.fastestFee, t('feeNext'), t('eta10')],
          [f.halfHourFee, t('fee30'), t('eta30')],
          [f.hourFee, t('fee1h'), t('eta60')],
          [f.economyFee, t('feeSlow'), t('etaLater')],
        ];
      return tile(
        't-fees',
        [t('fees'), t('feesShort')],
        el(
          'div',
          { class: 'fees' + (S.feesRtl ? ' rtl' : '') },
          cells.map(([v, l, e]) =>
            el(
              'div',
              { style: `border-top:3px solid ${L.feeColor(v)}` },
              el('b', null, L.fmtFee(v)),
              el('small', null, l),
              el('small', { class: 'est' }, e)
            )
          )
        )
      );
    },
    mem: () =>
      st.mem &&
      tile(
        't-mem',
        t('mempool'),
        L.fmtNum(st.mem.count) + ' tx',
        [
          [
            t('deep', { n: L.fmtNum(L.mempoolDepth(st.mem), 1) }),
            st.inflow != null ? more(t('inflow', { n: L.fmtNum(st.inflow, 0) })) : null,
          ],
        ],
        st.mem.fee_histogram ? [stack(feeBands(st.mem.fee_histogram)), el('div', { class: 'cap' }, t('byFee'))] : null
      ),
    price: () =>
      Number.isFinite(p) &&
      tile(
        't-price',
        t('price'),
        L.fmtNum(L.satsPerUnit(p)) + ' ' + S.satsSym,
        [t('perCur', { c: S.cur })],
        minis([
          ['BTC', L.fmtNum(p) + ' ' + S.cur],
          st.pct[S.cur] != null ? [t('h24'), pct24()] : null,
          S.showMoscow
            ? [
                t('moscow'),
                L.moscowTime(L.satsPerUnit(p)),
                {
                  href: '#/glossary',
                  title: t('moscowHint', {
                    t: L.moscowTime(L.satsPerUnit(p)),
                    n: L.fmtNum(L.satsPerUnit(p)),
                    c: S.cur,
                  }),
                },
              ]
            : null,
          S.showCap && Number.isFinite(h) ? [t('cap'), L.compact(L.marketCapUsd(h, p))] : null,
        ])
      ),
    ln: () => {
      const lnDate = (x) => fmtD(L.lnTakenAt(x), { dateOnly: true });
      if (!st.ln || !st.ln.channel_count) return null;
      const l = st.ln;
      return tile(
        't-ln',
        [t('lightning'), t('lnShort')],
        L.fmtNum(l.total_capacity / 1e8, 0) + ' BTC',
        [
          // the data server's Lightning figures can stop updating: when they are old, their date takes the place of
          // the node count (the dashboard shows one line under each figure), rather than pass them as today's
          L.lnStale(l)
            ? [
                // the date first: on a narrow tile the line is cut at its end, and the date is what matters here
                more(t('lnAsOf', { d: lnDate(l) }) + ' · ' + t('channels', { n: L.fmtNum(l.channel_count) })),
                less(t('lnAsOfShort', { d: lnDate(l) })), // a phone's tile has room for the date only
              ]
            : [t('channels', { n: L.fmtNum(l.channel_count) }), more(t('nodes', { n: L.fmtNum(l.node_count) }))],
        ],
        l.tor_nodes != null
          ? [
              stack([
                { v: l.clearnet_nodes, c: 'var(--accent)', label: t('lnKinds').split(' · ')[0] },
                { v: l.tor_nodes, c: 'var(--blue)', label: t('lnKinds').split(' · ')[1] },
                { v: l.clearnet_tor_nodes || 0, c: 'var(--dim)', label: t('lnKinds').split(' · ')[2] },
                { v: l.unannounced_nodes || 0, c: 'var(--line)', label: t('lnKinds').split(' · ')[3] },
              ]),
              el(
                'div',
                { class: 'cap legend' },
                t('lnKinds')
                  .split(' · ')
                  .map((k, i) =>
                    el(
                      'span',
                      null,
                      el('i', {
                        style: `background:${['var(--accent)', 'var(--blue)', 'var(--dim)', 'var(--line)'][i]}`,
                      }),
                      k
                    )
                  )
              ),
            ]
          : null
      );
    },
  };
  // the tiles in the order chosen in Settings; on wide screens the grid gets as many rows as the shown tiles need
  let n = 0;
  for (const { id, on } of dashTiles()) {
    const x = on && make[id]();
    if (x) {
      root.append(x);
      n++;
    }
  }
  root.style.setProperty('--rows', Math.max(1, Math.ceil((n - 2) / 4)));
  const proj =
    tileOn('proj') && st.proj && st.proj.length
      ? el(
          'div',
          { class: 'sgrp' },
          el('h2', null, t('projected')),
          el(
            'div',
            { class: 'blocks', tabindex: 0, role: 'region', 'aria-label': t('projected') },
            st.proj
              .slice(0, 6)
              .map((b, i) =>
                el(
                  i ? 'div' : 'a',
                  i ? { class: 'blk proj' } : { class: 'blk proj mining', href: '#/mining', title: t('mineLink') },
                  upcomingCube(b),
                  el('b', null, `~${L.fmtFee(b.medianFee)}`),
                  el('span', null, `${L.fmtNum(b.nTx)} tx`),
                  el('span', null, i ? t('minAhead', { n: (i + 1) * 10 }) : t('miningNow'))
                )
              )
          )
        )
      : null;
  const rec =
    tileOn('rec') && st.blocks.length
      ? el(
          'div',
          { class: 'sgrp' },
          el('h2', null, t('recent')),
          el(
            'div',
            { class: 'blocks', tabindex: 0, role: 'region', 'aria-label': t('recent') },
            st.blocks.slice(0, 12).map((x, i) => {
              const b = L.parseBlock(x);
              return el(
                'a',
                { class: 'blk' + (i === 0 ? ' cur' : ''), href: '#/block/' + b.height },
                minedCube(x),
                el('b', null, L.fmtNum(b.height)),
                el('span', null, L.fmtNum(b.txs) + ' tx'),
                el('span', null, t('ago', { t: L.fmtAgo(now / 1000 - b.ts) }))
              );
            })
          )
        )
      : null;
  if (proj || rec) root.append(el('section', { class: 'strip2' }, proj, rec));
  if (!Number.isFinite(h)) root.append(el('p', { class: 'dim' }, t('loading')));
  return root;
}
// Clock mode: the block height, time since the last block and the price, large, for a spare screen. The screen is kept awake.
// Clock mode's display options, from the link (#/clock?kiosk&eink), for a screen that stays on:
// kiosk: no close button or mouse pointer, says so when no new data has come for a while, and reloads every few hours;
// eink: black on white, nothing animated, and text that only changes when it must (whole minutes, a minute's price).
let opts = { kiosk: false, eink: false };
export function clockOpts(arg) {
  const q = new URLSearchParams(arg || '');
  return { kiosk: q.has('kiosk'), eink: q.has('eink') };
}
const STALE_SEC = 30 * 60;
// '12 min' on e-ink (no seconds), as usual otherwise.
export const clockSince = (now) =>
  opts.eink && st.blocks[0]
    ? t('minutes', { n: Math.floor(Math.max(0, now / 1000 - st.blocks[0].timestamp) / 60) })
    : sinceText(now);
// Shown on a screen left alone once nothing new has arrived for half an hour (connection lost, node down).
export const staleText = (now) =>
  (opts.kiosk || opts.eink) && now - st.dataAt > STALE_SEC * 1000
    ? t('staleFor', { m: Math.floor((now - Math.min(st.dataAt, st.freshAt || st.dataAt)) / 60000) })
    : '';
// The price, read at most once a minute on e-ink.
let einkPrice = { at: 0, v: NaN };
function clockPrice() {
  if (!opts.eink) return priceLine();
  const p = price(),
    now = Date.now();
  if (Number.isFinite(p) && (now - einkPrice.at > 60000 || !Number.isFinite(einkPrice.v)))
    einkPrice = { at: now, v: p };
  return Number.isFinite(einkPrice.v)
    ? el('div', { class: 'btc' }, el('b', { id: 'btc' }, L.fmtNum(Math.round(einkPrice.v)) + ' ' + S.cur))
    : null;
}
export function viewClock(arg) {
  opts = clockOpts(arg);
  const now = Date.now();
  return el(
    'div',
    { class: 'clockview' },
    el('h1', { class: 'sr-only' }, 'BLOCKHORIZON · ' + t('clock')),
    opts.kiosk ? null : el('a', { class: 'clock-x', href: '#/', 'aria-label': t('close'), title: t('close') }, '✕'),
    el('div', { class: 'eyebrow' }, t('height')),
    el('div', { class: 'clock-h', id: 'h' }, L.fmtNum(st.tip)),
    el('div', { class: 'since' }, t('since') + ': ', el('b', { id: 'since' }, clockSince(now))),
    clockPrice(),
    finalBlock(now),
    el('p', { class: 'stale', id: 'stale', role: 'status' }, staleText(now))
  );
}
// Countdown to the last block that creates new bitcoin (ticks every second with the 'since' line).
export const finalText = (now) => {
  const c = L.finalCountdown(st.tip, st.blocks[0] && st.blocks[0].timestamp, now);
  return c.done ? '' : opts.eink ? L.fmtLong(c.sec).replace(/\s*\d+\S*\s+\d+\S*\s+\d+\S*$/, '') : L.fmtLong(c.sec);
};
function finalBlock(now) {
  if (!Number.isFinite(st.tip)) return null;
  const c = L.finalCountdown(st.tip, st.blocks[0] && st.blocks[0].timestamp, now);
  return el(
    'div',
    { class: 'final' },
    el('div', { class: 'eyebrow' }, t('finalBlock') + ' · #' + L.fmtNum(L.FINAL_BLOCK)),
    c.done
      ? el('p', null, t('finalDone'))
      : [
          el('div', { class: 'final-t', id: 'final' }, finalText(now)),
          el('p', { class: 'dim' }, t('finalNote', { n: L.fmtNum(c.blocks), y: new Date(c.estMs).getUTCFullYear() })),
        ]
  );
}
