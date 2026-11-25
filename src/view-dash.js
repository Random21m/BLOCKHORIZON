// The dashboard and clock mode (repainted in place on every live update).
import * as L from './lib.js';
import { t } from './i18n.js';
import { S, st, fmtD, el, price } from './state.js';
import { bar, arc, spark, gapsChart, emissionChart, stack, feeBands, minis, minedCube, upcomingCube, more, pct24, tile, priceLine, sinceText } from './ui.js';

export function viewDash() {
  const h = st.tip, now = Date.now(), root = el('div', { class: 'dashgrid' }, el('h1', { class: 'sr-only' }, 'BLOCKHORIZON')), p = price();
  const hv = Number.isFinite(h) ? L.halvingInfo(h, now) : null, sp = Number.isFinite(h) ? L.supplyAt(h) : NaN;
  root.append(el('section', { class: 'tile hero' }, el('div', { class: 'eyebrow' }, t('height')), el('div', { class: 'height', id: 'h' }, L.fmtNum(h)),
    el('div', { class: 'since' }, t('since') + ': ', el('b', { id: 'since' }, sinceText(now))), priceLine()));
  if (hv) root.append(tile('t-halving', t('halving'), L.fmtNum(hv.blocksToGo) + ' ' + t('blocksToGo'),
    [[t('est', { d: fmtD(hv.estMs, { dateOnly: true }) }), more(t('atBlock', { n: L.fmtNum(hv.nextHeight) }))]], arc(hv.progress, (hv.progress * 100).toFixed(0) + '%', t('ofEpoch'))));
  if (st.diff) { const d = L.parseDifficulty(st.diff);
    root.append(tile('t-diff', t('difficulty'), (d.change >= 0 ? '+' : '') + d.change.toFixed(2) + '%', [[t('nBlocks', { n: L.fmtNum(d.blocksLeft) }), more(t('estAt', { d: fmtD(d.estMs) }))]], arc(d.progress, (d.progress * 100).toFixed(0) + '%', t('ofPeriod')))); }
  if (st.hr) { const a = L.hashrateAverages(st.hr.hashrates, st.hr.currentHashrate), sel = S.hr || 'd14', lab = { d7: '7d', d14: '14d', d30: '30d', d90: '90d' }[sel];
    root.append(tile('t-hash', t('hashrate'), L.fmtHashrate(a.current), [t('avgOf', { p: lab, v: L.fmtHashrate(a[sel]) })], spark((st.hr.hashrates || []).slice(-120).map((x) => x.avgHashrate)))); }
  if (hv) root.append(tile('t-supply', t('supply'), (sp / 1e14).toFixed(3) + 'M BTC', [[t('issued', { p: (sp / L.MAX_SATS * 100).toFixed(2) }), more(t('btcLeft', { n: L.fmtNum((L.MAX_SATS - sp) / 1e8, 0) }))]], [bar(sp / L.MAX_SATS), emissionChart(hv.epoch)]));
  if (st.blocks[0]) { const b = L.parseBlock(st.blocks[0]), x0 = st.blocks[0];
    root.append(tile('t-last', t('last'), el('a', { href: '#/block/' + b.height }, '#' + L.fmtNum(b.height)), [[`${L.fmtNum(b.txs)} tx · ${(x0.size / 1e6).toFixed(2)} MB`, S.showPool && b.pool ? more(' · ' + b.pool) : null]],
      el('div', { class: 'lastviz' }, el('div', { class: 'bigcube' }, minedCube(x0)), el('div', { class: 'fillnote' }, t('full', { p: Math.round((x0.weight || 0) / 4e4) }), el('div', { class: 'stripe', style: `background:${L.feeStripes(b.feeRange)}` }), el('small', null, b.feeRange.length ? t('feesRange', { a: L.fmtFee(b.feeRange[0]), b: L.fmtFee(b.feeRange[b.feeRange.length - 1]) }) : ''))))); }
  if (st.blocks.length > 1) { const bs = L.blockTimeStats(st.blocks, now / 1000);
    root.append(tile('t-prod', t('production'), L.fmtDuration(bs.avg), [t('fastSlow', { f: bs.fast, s: bs.slow })], gapsChart(st.blocks))); }
  if (S.showFees && st.fees) { const f = st.fees, cells = [[f.fastestFee, t('feeNext'), t('eta10')], [f.halfHourFee, t('fee30'), t('eta30')], [f.hourFee, t('fee1h'), t('eta60')], [f.economyFee, t('feeSlow'), t('etaLater')]];
    root.append(tile('t-fees', t('fees'), el('div', { class: 'fees' + (S.feesRtl ? ' rtl' : '') }, cells.map(([v, l, e]) => el('div', { style: `border-top:3px solid ${L.feeColor(v)}` }, el('b', null, L.fmtFee(v)), el('small', null, l), el('small', { class: 'est' }, e)))))); }
  if (S.showFees && st.mem) root.append(tile('t-mem', t('mempool'), L.fmtNum(st.mem.count) + ' tx', [[t('deep', { n: L.fmtNum(L.mempoolDepth(st.mem), 1) }), st.inflow != null ? more(t('inflow', { n: L.fmtNum(st.inflow, 0) })) : null]],
    st.mem.fee_histogram ? [stack(feeBands(st.mem.fee_histogram)), el('div', { class: 'cap' }, t('byFee'))] : null));
  if (Number.isFinite(p)) root.append(tile('t-price', t('price'), L.fmtNum(L.satsPerUnit(p)) + ' ' + S.satsSym, [t('perCur', { c: S.cur })],
    minis([['BTC', L.fmtNum(p) + ' ' + S.cur], st.pct[S.cur] != null ? [t('h24'), pct24()] : null, S.showMoscow ? [t('moscow'), L.moscowTime(L.satsPerUnit(p))] : null, S.showCap && Number.isFinite(h) ? [t('cap'), L.compact(L.marketCapUsd(h, p))] : null])));
  if (st.ln && st.ln.channel_count) { const l = st.ln;
    root.append(tile('t-ln', t('lightning'), L.fmtNum(l.total_capacity / 1e8, 0) + ' BTC', [[t('channels', { n: L.fmtNum(l.channel_count) }), more(t('nodes', { n: L.fmtNum(l.node_count) }))]],
      l.tor_nodes != null ? [stack([{ v: l.clearnet_nodes, c: 'var(--accent)', label: 'clearnet' }, { v: l.tor_nodes, c: 'var(--blue)', label: 'tor' }, { v: l.clearnet_tor_nodes || 0, c: 'var(--dim)', label: 'both' }, { v: l.unannounced_nodes || 0, c: 'var(--line)', label: 'unannounced' }]), el('div', { class: 'cap' }, t('lnKinds'))] : null)); }
  const proj = S.showFees && st.proj && st.proj.length ? el('div', { class: 'sgrp' }, el('h2', null, t('projected')), el('div', { class: 'blocks', tabindex: 0, role: 'region', 'aria-label': t('projected') }, st.proj.slice(0, 6).map((b, i) => el('div', { class: 'blk proj' }, upcomingCube(b), el('b', null, `~${L.fmtFee(b.medianFee)}`), el('span', null, `${L.fmtNum(b.nTx)} tx`), el('span', null, t('minAhead', { n: (i + 1) * 10 })))))) : null;
  const rec = st.blocks.length ? el('div', { class: 'sgrp' }, el('h2', null, t('recent')), el('div', { class: 'blocks', tabindex: 0, role: 'region', 'aria-label': t('recent') }, st.blocks.slice(0, 12).map((x, i) => { const b = L.parseBlock(x); return el('a', { class: 'blk' + (i === 0 ? ' cur' : ''), href: '#/block/' + b.height }, minedCube(x), el('b', null, L.fmtNum(b.height)), el('span', null, L.fmtNum(b.txs) + ' tx'), el('span', null, t('ago', { t: L.fmtAgo(now / 1000 - b.ts) }))); }))) : null;
  if (proj || rec) root.append(el('section', { class: 'strip2' }, proj, rec));
  if (!Number.isFinite(h)) root.append(el('p', { class: 'dim' }, t('loading')));
  return root;
}
// Clock mode: the block height, time since the last block and the price, large, for a spare screen. The screen is kept awake.
export function viewClock() {
  const now = Date.now();
  return el('div', { class: 'clockview' }, el('h1', { class: 'sr-only' }, 'BLOCKHORIZON · ' + t('clock')), el('a', { class: 'clock-x', href: '#/', 'aria-label': t('close'), title: t('close') }, '✕'),
    el('div', { class: 'eyebrow' }, t('height')), el('div', { class: 'clock-h', id: 'h' }, L.fmtNum(st.tip)),
    el('div', { class: 'since' }, t('since') + ': ', el('b', { id: 'since' }, sinceText(now))), priceLine());
}
