import * as L from './lib.js';
import { api, live, store } from './api.js';
import { livePrice } from './price.js';
import { t, setLang, detectLang, LANGS } from './i18n.js';
import { play, BLOCK_SOUNDS, ALARM_SOUNDS } from './sound.js';
import { GLOSSARY, ANNIVERSARIES } from './content.js';

export const VERSION = '0.5.3';
export const TIP_ADDR = 'npub1vj8zjhnmkhekv93e2xmrz7kfwuxq25vrzw53u4dqhwd2lp5smvks3mwu2n@npub.cash';
const $ = (s, r = document) => r.querySelector(s);
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'AUD', 'JPY'];
const US = /^en-US/i.test((typeof navigator !== 'undefined' && navigator.language) || '');
const DEF = { theme: 'dark', lang: detectLang(), cur: 'USD', h12: US, dateFmt: US ? 'mdy' : 'iso', utc: false, showFees: true, feesRtl: false, showPool: true, showMoscow: true, showCap: true,
  hr: 'd14', ripple: true, pulse: true, reduced: false, sound: false, bsound: 'drop', asound: 'clock', satsSym: 'sats' };
const saved = store('settings') || {};
if (saved._v !== 2) { delete saved.h12; delete saved.dateFmt; saved._v = 2; } // older versions saved the then-default formats
const S = Object.assign({}, DEF, saved);
const save = () => store('settings', S);
const st = { shown: NaN, shownCur: '', dir: 0, raf: 0, pct: {}, priceLive: false, priceAt: 0, tip: NaN, blocks: [], diff: null, fees: null, mem: null, proj: null, prices: null, hr: null, ln: null, last: 0, conn: 'off' };
const alarms = () => store('alarms') || [];
function tzShort(ms) { try { const p = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName'); return p ? p.value : ''; } catch { return ''; } }
const fmtD = (ms, o) => { const opt = Object.assign({ h12: S.h12, dateFmt: S.dateFmt, utc: S.utc }, o); const base = L.fmtDate(ms, opt); return opt.dateOnly ? base : base + ' ' + (opt.utc ? 'UTC' : tzShort(ms)); };

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
function toast(msg) { const x = $('#toast'); x.textContent = msg; x.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { x.hidden = true; }, 3500); }
function applyLook() {
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = S.lang; setLang(S.lang);
  document.body.classList.toggle('reduced', S.reduced); document.body.classList.toggle('nopulse', !S.pulse);
  const m = $('meta[name=theme-color]'); if (m) m.content = dark ? '#0E0D0C' : '#EAE3D2';
}
const price = () => (st.prices && st.prices[S.cur]) || NaN;
const NAVS = [['/', 'dash'], ['/alarm', 'alarm'], ['/calc', 'calc'], ['/replay', 'replay'], ['/events', 'events'], ['/glossary', 'glossary'], ['/about', 'about']];

// ---------- data ----------
async function refreshAll() {
  const jobs = {
    tip: api.tip().then((v) => { const h = L.parseTipHeight(v); if (Number.isFinite(h)) st.tip = h; }),
    blocks: api.blocks().then((b) => { if (Array.isArray(b)) st.blocks = b; }),
    diff: api.difficulty().then((v) => { st.diff = v; }), fees: api.fees().then((v) => { st.fees = v; }),
    mem: api.mempool().then((v) => { st.mem = v; }), proj: api.projected().then((v) => { st.proj = v; }),
    prices: api.prices().then((v) => { st.prices = Date.now() - st.priceAt < 30000 ? Object.assign({}, v, st.prices) : v; }), hr: api.hashrate().then((v) => { st.hr = v; }), ln: api.lightning().then((v) => { st.ln = v.latest || v; }),
  };
  const r = await Promise.allSettled(Object.values(jobs));
  if (r.every((x) => x.status === 'rejected')) st.conn = 'off';
  if (!Number.isFinite(st.tip) && st.blocks[0]) st.tip = st.blocks[0].height;
  render();
}
function onNewBlock(b) {
  if (!b || !Number.isFinite(b.height)) return;
  const fresh = b.height > st.tip;
  st.blocks = [b, ...st.blocks.filter((x) => x.height !== b.height)].slice(0, 15);
  if (fresh) { st.tip = b.height; if (S.sound) play(S.bsound); checkAlarms(); api.difficulty().then((v) => { st.diff = v; render(); }).catch(() => {}); animateNew(); }
  render();
}
function onLive(m) {
  if (m.block) onNewBlock(m.block);
  if (m.blocks && m.blocks.length && !st.blocks.length) { st.blocks = m.blocks.slice().sort((a, b) => b.height - a.height); st.tip = st.blocks[0].height; }
  if (m.mempoolInfo) { st.mem = Object.assign({}, st.mem, { count: m.mempoolInfo.size, vsize: m.mempoolInfo.bytes || st.mem && st.mem.vsize }); }
  if (m['mempool-blocks']) st.proj = m['mempool-blocks'];
  if (m.fees) st.fees = m.fees;
  if (m.vBytesPerSecond != null) st.inflow = m.vBytesPerSecond;
  render();
}
let tickTimer;
function paintPrice() {
  const e = document.getElementById('btc'); if (e && Number.isFinite(st.shown)) e.textContent = L.fmtNum(st.shown, st.shown < 100 ? 2 : 0) + ' ' + S.cur;
  const d = document.getElementById('btcdir'); if (d) { d.textContent = st.dir > 0 ? '▲' : st.dir < 0 ? '▼' : ''; d.className = 'dir ' + (st.dir > 0 ? 'up' : 'down'); }
}
function glidePrice() { // the big price eases toward each new trade price (no flashing); reduced motion jumps straight there
  cancelAnimationFrame(st.raf);
  const step = () => {
    const target = price(); if (!Number.isFinite(target)) return;
    if (st.shownCur !== S.cur || !Number.isFinite(st.shown)) { st.shown = target; st.shownCur = S.cur; }
    const diff = target - st.shown;
    if (S.reduced || Math.abs(diff) < 0.5) { st.shown = target; paintPrice(); return; }
    st.shown += diff * 0.22; paintPrice(); st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}
function onPriceTick(t) {
  const prev = st.prices && st.prices[t.cur];
  st.prices = Object.assign({}, st.prices, { [t.cur]: t.price }); st.priceAt = Date.now(); if (t.pct != null) st.pct[t.cur] = t.pct;
  if (t.cur === S.cur) { if (Number.isFinite(prev) && t.price !== prev) st.dir = t.price > prev ? 1 : -1; glidePrice(); }
  if (!tickTimer) tickTimer = setTimeout(() => { tickTimer = null; store('prices', st.prices); render(); }, 400);
}
function checkAlarms() {
  const a = alarms(), hit = a.filter((x) => st.tip >= x.height), rest = a.filter((x) => st.tip < x.height);
  if (!hit.length) return; store('alarms', rest);
  for (const x of hit) { toast(`⏰ Block ${L.fmtNum(x.height)} reached${x.label ? ': ' + x.label : ''}`); play(x.sound || S.asound); }
}
function animateNew() { /* no flashing: the number simply updates */ }

// ---------- views ----------
const panel = (title, ...kids) => el('section', { class: 'panel' }, el('h2', null, title), ...kids);
const kv = (rows) => el('dl', { class: 'kv' }, rows.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]));
const bar = (p) => el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${Math.max(0, Math.min(1, p)) * 100}%` }));
function arc(p, big, sub) {
  const r = 70, c = Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, p)));
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 180 110'); s.setAttribute('class', 'arc'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', `${(p * 100).toFixed(1)}%`);
  s.innerHTML = `<path class="trk" d="M20 90 A70 70 0 0 1 160 90"/><path class="val" d="M20 90 A70 70 0 0 1 160 90" stroke-dasharray="${c}" stroke-dashoffset="${off}"/><text x="90" y="82"></text><text class="sub" x="90" y="100"></text>`;
  s.querySelectorAll('text')[0].textContent = big; s.querySelectorAll('text')[1].textContent = sub; return s;
}
function spark(vals) {
  const v = vals.filter(Number.isFinite); if (v.length < 2) return el('div');
  const lo = Math.min(...v), hi = Math.max(...v), w = 300, h = 64, pad = 4, rng = hi - lo || 1;
  const pts = v.map((y, i) => [i / (v.length - 1) * w, h - pad - (y - lo) / rng * (h - 2 * pad)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('class', 'spark'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="a" d="${d}L${w} ${h}L0 ${h}Z" style="color:var(--accent)"/><path class="l" d="${d}" vector-effect="non-scaling-stroke"/>`;
  return s;
}
// ---- small graphics for the dashboard tiles (shown on larger screens only) ----
const NS = 'http://www.w3.org/2000/svg';
function chart(w, h, inner, label) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); s.innerHTML = inner;
  return el('div', { class: 'chartbox' }, s);
}
function gapsChart(blocks) {
  const b = (blocks || []).slice().sort((x, y) => x.height - y.height).slice(-16), gaps = [];
  for (let i = 1; i < b.length; i++) gaps.push(Math.max(0, b[i].timestamp - b[i - 1].timestamp));
  if (gaps.length < 2) return null;
  const w = 320, h = 80, max = Math.max(1200, ...gaps), bw = w / gaps.length, y600 = h - 600 / max * h;
  const bars = gaps.map((g, i) => { const bh = Math.max(2, g / max * h); return `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${bh.toFixed(1)}" fill="${g >= 600 ? 'var(--accent)' : 'var(--dim)'}"/>`; }).join('');
  return chart(w, h, bars + `<line x1="0" x2="${w}" y1="${y600.toFixed(1)}" y2="${y600.toFixed(1)}" stroke="var(--text)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`, 'Time between the last blocks against the 10 minute target');
}
function difficultyChart(hist) {
  const d = (hist || []).filter((x) => Number.isFinite(x.adjustment)).slice(-14);
  if (d.length < 2) return null;
  const w = 320, h = 80, mid = h / 2, pcts = d.map((x) => (x.adjustment - 1) * 100), max = Math.max(5, ...pcts.map(Math.abs)), bw = w / d.length;
  const bars = pcts.map((p, i) => { const bh = Math.max(1.5, Math.abs(p) / max * (mid - 4)); return `<rect x="${(i * bw + 2).toFixed(1)}" y="${(p >= 0 ? mid - bh : mid).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="${p >= 0 ? 'var(--accent)' : 'var(--blue)'}"/>`; }).join('');
  return chart(w, h, bars + `<line x1="0" x2="${w}" y1="${mid}" y2="${mid}" stroke="var(--dim)" stroke-width="1" vector-effect="non-scaling-stroke"/>`, 'Recent difficulty adjustments, up or down');
}
function emissionChart(epoch) {
  const w = 320, h = 80, n = 12, bw = w / n;
  const bars = Array.from({ length: n }, (_, e) => { const bh = Math.max(2, 50 / 2 ** e / 50 * (h - 2)); return `<rect x="${(e * bw + 2).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="${e === epoch ? 'var(--accent)' : e < epoch ? 'var(--dim)' : 'var(--line)'}"/>`; }).join('');
  return chart(w, h, bars, 'Block reward by epoch, halving every 210,000 blocks');
}
const stack = (segs) => el('div', { class: 'stack' }, segs.map((x) => el('i', { style: `flex:${x.v};background:${x.c}`, title: x.label })));
function feeBands(hist) {
  const br = [0, 1, 2, 3, 5, 8, 12, 20, 30, 50, 100, 300], sums = br.map(() => 0);
  for (const [f, v] of hist || []) { let i = 0; for (let k = 0; k < br.length; k++) if (f >= br[k]) i = k; sums[i] += v; }
  return br.map((b, i) => ({ v: sums[i], c: L.feeColor(b), label: `${b}+ sat/vB` })).filter((x) => x.v > 0);
}
const minis = (rows) => el('div', { class: 'minis' }, rows.filter(Boolean).map(([k, v]) => el('div', { class: 'mini' }, el('small', null, k), el('b', null, v))));
const cube = (p, fill, base) => el('div', { class: 'cube', style: `background:${base}` }, el('i', { style: `height:${Math.max(4, Math.min(100, p * 100)).toFixed(0)}%;background:${fill}` }));
const minedCube = (x) => cube((x.weight || 0) / 4e6, `linear-gradient(${L.MINED_TOP}, ${L.MINED_BOTTOM})`, L.MINED_EMPTY);
const upcomingCube = (b) => cube((b.blockVSize || 0) / 1e6, L.feeStripes(b.feeRange), L.UPCOMING_EMPTY);
const more = (x) => el('span', { class: 'more' }, x);
function tile(cls, title, value, subs = [], extra) {
  return el('section', { class: 'tile ' + cls }, el('h2', null, title), el('div', { class: 'tv' }, value), ...[].concat(extra || []), ...subs.filter(Boolean).map((x, i) => el('div', { class: 'ts s' + i }, x)));
}
function viewDash() {
  const h = st.tip, now = Date.now(), root = el('div', { class: 'dashgrid' });
  const since = st.blocks[0] ? now / 1000 - st.blocks[0].timestamp : NaN, p = price();
  const hv = Number.isFinite(h) ? L.halvingInfo(h, now) : null, sp = Number.isFinite(h) ? L.supplyAt(h) : NaN;
  root.append(el('section', { class: 'tile hero' }, el('div', { class: 'eyebrow' }, t('height')), el('div', { class: 'height', id: 'h' }, L.fmtNum(h)),
    el('div', { class: 'since' }, t('since') + ': ', el('b', { id: 'since' }, Number.isFinite(since) ? L.fmtDuration(since) : '–')),
    Number.isFinite(p) ? el('div', { class: 'btc' }, el('b', { id: 'btc' }, (() => { const v = st.shownCur === S.cur && Number.isFinite(st.shown) ? st.shown : p; return L.fmtNum(v, v < 100 ? 2 : 0) + ' ' + S.cur; })()), el('span', { id: 'btcdir', class: 'dir ' + (st.dir > 0 ? 'up' : 'down') }, st.dir > 0 ? '▲' : st.dir < 0 ? '▼' : ''), st.pct[S.cur] != null ? el('span', { class: 'chg' }, (st.pct[S.cur] >= 0 ? '▲ ' : '▼ ') + Math.abs(st.pct[S.cur]).toFixed(2) + '% 24h') : null, el('span', { class: 'src' }, st.priceLive ? 'live · Kraken' : 'mempool.space')) : null,
    null));
  if (hv) root.append(tile('t-halving', t('halving'), L.fmtNum(hv.blocksToGo) + ' ' + t('blocksToGo'),
    [['Est. ' + fmtD(hv.estMs, { dateOnly: true }), more(` · block ${L.fmtNum(hv.nextHeight)}`)]], arc(hv.progress, (hv.progress * 100).toFixed(0) + '%', 'of epoch')));
  if (st.diff) { const d = L.parseDifficulty(st.diff);
    root.append(tile('t-diff', t('difficulty'), (d.change >= 0 ? '+' : '') + d.change.toFixed(2) + '%', [[`${L.fmtNum(d.blocksLeft)} blocks`, more(` · est. ${fmtD(d.estMs)}`)]], arc(d.progress, (d.progress * 100).toFixed(0) + '%', 'of period'))); }
  if (st.hr) { const a = L.hashrateAverages(st.hr.hashrates, st.hr.currentHashrate), sel = S.hr || 'd14', lab = { d7: '7d', d14: '14d', d30: '30d', d90: '90d' }[sel];
    root.append(tile('t-hash', t('hashrate'), L.fmtHashrate(a.current), [`${lab} average ${L.fmtHashrate(a[sel])}`], spark((st.hr.hashrates || []).slice(-120).map((x) => x.avgHashrate)))); }
  if (hv) root.append(tile('t-supply', t('supply'), (sp / 1e14).toFixed(3) + 'M BTC', [[`${(sp / L.MAX_SATS * 100).toFixed(2)}% issued`, more(` · ${L.fmtNum((L.MAX_SATS - sp) / 1e8, 0)} BTC left`)]], [bar(sp / L.MAX_SATS), emissionChart(hv.epoch)]));
  if (st.blocks[0]) { const b = L.parseBlock(st.blocks[0]), x0 = st.blocks[0];
    root.append(tile('t-last', t('last'), el('a', { href: '#/block/' + b.height }, '#' + L.fmtNum(b.height)), [[`${L.fmtNum(b.txs)} tx · ${(x0.size / 1e6).toFixed(2)} MB`, S.showPool && b.pool ? more(' · ' + b.pool) : null]],
      el('div', { class: 'lastviz' }, el('div', { class: 'bigcube' }, minedCube(x0)), el('div', { class: 'fillnote' }, Math.round((x0.weight || 0) / 4e4) + '% full', el('div', { class: 'stripe', style: `background:${L.feeStripes(b.feeRange)}` }), el('small', null, b.feeRange.length ? `fees ${L.fmtFee(b.feeRange[0])}–${L.fmtFee(b.feeRange[b.feeRange.length - 1])} sat/vB` : ''))))); }
  if (st.blocks.length > 1) { const bs = L.blockTimeStats(st.blocks, now / 1000);
    root.append(tile('t-prod', t('production'), L.fmtDuration(bs.avg), [`${bs.fast} fast · ${bs.slow} slow · target 10m`], gapsChart(st.blocks))); }
  if (S.showFees && st.fees) { const f = st.fees, cells = [[f.fastestFee, 'Next', '~10 min'], [f.halfHourFee, '30m', '~30 min'], [f.hourFee, '1h', '~1 hour'], [f.economyFee, 'Slow', 'later']];
    root.append(tile('t-fees', t('fees'), el('div', { class: 'fees' + (S.feesRtl ? ' rtl' : '') }, cells.map(([v, l, e]) => el('div', { style: `border-top:3px solid ${L.feeColor(v)}` }, el('b', null, L.fmtFee(v)), el('small', null, l), el('small', { class: 'est' }, e)))))); }
  if (S.showFees && st.mem) root.append(tile('t-mem', t('mempool'), L.fmtNum(st.mem.count) + ' tx', [[`${L.fmtNum(L.mempoolDepth(st.mem), 1)} blocks deep`, st.inflow != null ? more(` · ${L.fmtNum(st.inflow, 0)} vB/s in`) : null]],
    st.mem.fee_histogram ? [stack(feeBands(st.mem.fee_histogram)), el('div', { class: 'cap' }, 'by fee: low → high')] : null));
  if (Number.isFinite(p)) root.append(tile('t-price', t('price'), L.fmtNum(L.satsPerUnit(p)) + ' ' + S.satsSym, [`per ${S.cur}`],
    minis([['BTC', L.fmtNum(p) + ' ' + S.cur], st.pct[S.cur] != null ? ['24h', (st.pct[S.cur] >= 0 ? '▲ ' : '▼ ') + Math.abs(st.pct[S.cur]).toFixed(2) + '%'] : null, S.showMoscow ? ['Moscow', L.moscowTime(L.satsPerUnit(p))] : null, S.showCap && Number.isFinite(h) ? ['Cap', L.compact(L.marketCapUsd(h, p))] : null])));
  if (st.ln && st.ln.channel_count) { const l = st.ln;
    root.append(tile('t-ln', t('lightning'), L.fmtNum(l.total_capacity / 1e8, 0) + ' BTC', [[`${L.fmtNum(l.channel_count)} channels`, more(` · ${L.fmtNum(l.node_count)} nodes`)]],
      l.tor_nodes != null ? [stack([{ v: l.clearnet_nodes, c: 'var(--accent)', label: 'clearnet' }, { v: l.tor_nodes, c: 'var(--blue)', label: 'tor' }, { v: l.clearnet_tor_nodes || 0, c: 'var(--dim)', label: 'both' }, { v: l.unannounced_nodes || 0, c: 'var(--line)', label: 'unannounced' }]), el('div', { class: 'cap' }, 'clearnet · Tor · both · hidden')] : null)); }
  const proj = S.showFees && st.proj && st.proj.length ? el('div', { class: 'sgrp' }, el('h2', null, t('projected')), el('div', { class: 'blocks' }, st.proj.slice(0, 6).map((b, i) => el('div', { class: 'blk proj' }, upcomingCube(b), el('b', null, `~${L.fmtFee(b.medianFee)}`), el('span', null, `${L.fmtNum(b.nTx)} tx`), el('span', null, `~${(i + 1) * 10} min`))))) : null;
  const rec = st.blocks.length ? el('div', { class: 'sgrp' }, el('h2', null, t('recent')), el('div', { class: 'blocks' }, st.blocks.slice(0, 12).map((x, i) => { const b = L.parseBlock(x); return el('a', { class: 'blk' + (i === 0 ? ' cur' : ''), href: '#/block/' + b.height }, minedCube(x), el('b', null, L.fmtNum(b.height)), el('span', null, L.fmtNum(b.txs) + ' tx'), el('span', null, L.fmtAgo(now / 1000 - b.ts) + ' ago')); }))) : null;
  if (proj || rec) root.append(el('section', { class: 'strip2' }, proj, rec));
  if (!Number.isFinite(h)) root.append(el('p', { class: 'dim' }, 'Loading…'));
  return root;
}
let blockToken = 0;
function viewBlock(hStr) {
  const root = el('div'), n = L.parseHeightInput(hStr), tok = ++blockToken;
  root.append(el('a', { class: 'back', href: '#/' }, '← ' + t('dash')), el('h1', null, 'BLOCK ' + (Number.isFinite(n) ? L.fmtNum(n) : '?')));
  const body = el('div', { class: 'panel' }, 'Loading…'); root.append(body);
  if (!Number.isFinite(n)) { body.textContent = t('notFound'); return root; }
  (async () => {
    try {
      const hash = (await api.hashAt(n)).trim(), raw = await api.block(hash); if (tok !== blockToken) return;
      const b = L.parseBlock(raw); body.replaceChildren(
        kv([['Hash', b.id], ['Time', fmtD(b.ts * 1000)], ['Transactions', L.fmtNum(b.txs)], ['Size', L.fmtNum(b.size) + ' B'], ['Weight', L.fmtNum(b.weight) + ' WU'],
          ['Median fee', L.fmtFee(b.medianFee) + ' sat/vB'], ['Fee range', b.feeRange.length ? `${L.fmtFee(b.feeRange[0])} – ${L.fmtFee(b.feeRange[b.feeRange.length - 1])} sat/vB` : '–'],
          ['Subsidy + fees', `${L.satsToBtc(L.subsidy(b.height), 4)} + ${L.satsToBtc(b.fees, 4)} BTC`], ['Mined by', b.pool || '–'], ['Empty block', b.empty ? 'yes' : 'no'],
          b.height === 0 ? ['Special', 'Genesis block'] : null].filter(Boolean)),
        el('div', { class: 'row' }, el('a', { href: '#/block/' + (n - 1) }, '← ' + L.fmtNum(n - 1)), n < st.tip ? el('a', { href: '#/block/' + (n + 1) }, L.fmtNum(n + 1) + ' →') : null));
    } catch { if (tok === blockToken) body.textContent = t('notFound'); }
  })();
  return root;
}
function viewAlarm() {
  const root = el('div'); root.append(el('h1', null, 'BLOCK ALARM'), el('p', { class: 'dim' }, 'Get a sound and a message when the chain reaches a block height. The page must stay open (or installed and running). Times assume one block every 10 minutes.'));
  const inH = el('input', { id: 'al-h', type: 'text', inputmode: 'numeric', placeholder: 'Block height', 'aria-label': 'Block height', value: Number.isFinite(st.tip) ? String(st.tip + 6) : '' });
  const inB = el('input', { id: 'al-b', type: 'text', inputmode: 'numeric', placeholder: 'or blocks from now', 'aria-label': 'Blocks from now', size: 10 });
  const inL = el('input', { id: 'al-l', type: 'text', placeholder: 'Label (optional)', 'aria-label': 'Label', maxlength: 40 });
  const sel = el('select', { id: 'al-s', 'aria-label': 'Sound' }, Object.entries(ALARM_SOUNDS).map(([k, v]) => el('option', { value: k, selected: k === S.asound }, v)));
  const out = el('div', { class: 'dim', id: 'al-out' });
  const preview = () => { const hh = inB.value ? st.tip + (parseInt(inB.value, 10) || 0) : L.parseHeightInput(inH.value); if (!Number.isFinite(hh)) { out.textContent = ''; return null; }
    const f = L.futureEstimate(hh, st.tip); out.textContent = f.past ? 'That block is already mined.' : `${L.fmtNum(f.blocks)} blocks away · about ${fmtD(f.ms)}`; return f.past ? null : hh; };
  inH.addEventListener('input', preview); inB.addEventListener('input', preview);
  root.append(el('div', { class: 'row' }, inH, inB, inL, sel, el('button', { class: 'btn-go', onclick: () => { const hh = preview(); if (hh == null) return toast(t('notFound')); const a = alarms(); a.push({ height: hh, label: inL.value.trim(), sound: sel.value }); store('alarms', a); play(sel.value); renderView(); } }, 'Set alarm'), el('button', { onclick: () => play(sel.value) }, '▶ Test')), out);
  const list = alarms(); root.append(el('h2', { class: 'dim mono' }, 'ACTIVE ALARMS'), list.length ? el('table', null, el('tbody', null, list.map((a, i) => el('tr', null, el('td', null, L.fmtNum(a.height)), el('td', null, a.label || ''), el('td', null, L.fmtNum(a.height - st.tip) + ' blocks'), el('td', null, el('button', { onclick: () => { const x = alarms(); x.splice(i, 1); store('alarms', x); renderView(); } }, 'Remove')))))) : el('p', { class: 'dim' }, 'None yet.'));
  preview(); return root;
}
function viewCalc() {
  const root = el('div'); root.append(el('h1', null, 'CALCULATOR'));
  const p = price(), res = (id) => el('div', { id, class: 'big', style: 'margin:6px 0' });
  const a = el('div', { class: 'panel' }, el('h2', null, 'Sats ⇄ ' + S.cur));
  const sats = el('input', { id: 'c-sats', inputmode: 'decimal', placeholder: 'sats', 'aria-label': 'Sats' }), fiat = el('input', { id: 'c-fiat', inputmode: 'decimal', placeholder: S.cur, 'aria-label': S.cur });
  sats.addEventListener('input', () => { const v = parseFloat(sats.value); fiat.value = Number.isFinite(v) && p ? (v / 1e8 * p).toFixed(2) : ''; });
  fiat.addEventListener('input', () => { const v = parseFloat(fiat.value); sats.value = Number.isFinite(v) && p ? Math.round(v / p * 1e8) : ''; });
  a.append(el('div', { class: 'row' }, sats, el('span', null, '⇄'), fiat), el('div', { class: 'dim' }, p ? `1 BTC = ${L.fmtNum(p)} ${S.cur}` : 'Price not loaded'));
  const b = el('div', { class: 'panel' }, el('h2', null, 'Block height ⇄ date'));
  const bh = el('input', { id: 'c-h', inputmode: 'numeric', placeholder: 'Block height', 'aria-label': 'Block height' }), out = res('c-out');
  bh.addEventListener('input', () => { const n = L.parseHeightInput(bh.value); if (!Number.isFinite(n)) { out.textContent = ''; return; } const f = L.futureEstimate(n, st.tip); const sp = L.supplyAt(n);
    out.textContent = (f.past ? 'Mined ~ ' : 'Estimated ') + fmtD(f.ms); out.title = ''; $('#c-sup').textContent = `Supply at that block: ${L.satsToBtc(sp, 4)} BTC · reward ${L.satsToBtc(L.subsidy(n), 4)} BTC`; });
  b.append(el('div', { class: 'row' }, bh), out, el('div', { class: 'dim', id: 'c-sup' }), el('p', { class: 'dim' }, 'Future dates assume a 10-minute block. Past dates are estimates too: use Search by date for exact blocks.'));
  root.append(el('div', { class: 'grid' }, a, b)); return root;
}
function viewReplay() {
  const root = el('div'); root.append(el('h1', null, 'HALVING REPLAY'), el('p', { class: 'dim' }, 'Step through every halving: the reward per block drops by half each 210,000 blocks.'));
  const last = Math.floor((Number.isFinite(st.tip) ? st.tip : 0) / L.EPOCH);
  const rows = Array.from({ length: Math.max(last, 0) + 2 }, (_, e) => ({ e, h: e * L.EPOCH, reward: L.subsidy(e * L.EPOCH), supply: e ? L.supplyAt(e * L.EPOCH - 1) : 0, date: L.HALVINGS[e] }));
  const out = el('div', { class: 'panel' }), slider = el('input', { type: 'range', min: 0, max: rows.length - 1, value: 0, id: 'rp', 'aria-label': 'Halving step', style: 'width:100%' });
  const show = (i) => { const r = rows[i]; out.replaceChildren(el('h2', null, i === 0 ? 'Genesis epoch' : `Halving ${i}`), el('div', { class: 'big' }, L.satsToBtc(r.reward, 4) + ' BTC per block'),
    kv([['Starts at block', L.fmtNum(r.h)], ['Date', r.date ? fmtD(r.date, { dateOnly: true }) : (r.h <= st.tip ? '–' : 'about ' + fmtD(L.futureEstimate(r.h, st.tip).ms, { dateOnly: true }))], ['Supply before', L.satsToBtc(r.supply, 2) + ' BTC'], ['Share of 21M', (r.supply / L.MAX_SATS * 100).toFixed(2) + '%']]), bar(r.supply / L.MAX_SATS)); };
  slider.addEventListener('input', () => show(+slider.value)); let timer;
  const playBtn = el('button', { class: 'btn-go', onclick: () => { clearInterval(timer); slider.value = 0; show(0); timer = setInterval(() => { if (+slider.value >= rows.length - 1) return clearInterval(timer); slider.value = +slider.value + 1; show(+slider.value); }, S.reduced ? 400 : 1100); } }, '▶ Play');
  addEventListener('hashchange', () => clearInterval(timer), { once: true });
  root.append(el('div', { class: 'row' }, playBtn, slider), out); show(0); return root;
}
function viewEvents() {
  const root = el('div'); root.append(el('h1', null, 'CHAIN CALENDAR'));
  const upcoming = []; const now = Date.now();
  if (Number.isFinite(st.tip)) { const hv = L.halvingInfo(st.tip, now); upcoming.push([hv.estMs, `Halving at block ${L.fmtNum(hv.nextHeight)} (reward ${L.satsToBtc(hv.nextSubsidy, 5)} BTC)`]);
    if (st.diff) upcoming.push([st.diff.estimatedRetargetDate, `Difficulty adjustment at block ${L.fmtNum(st.diff.nextRetargetHeight)} (${st.diff.difficultyChange >= 0 ? '+' : ''}${st.diff.difficultyChange.toFixed(2)}% expected)`]);
    for (const m of [1000000, 1050000, 1100000]) if (m > st.tip && m !== hv.nextHeight) upcoming.push([L.futureEstimate(m, st.tip, now).ms, `Block ${L.fmtNum(m)}`]); }
  upcoming.sort((a, b) => a[0] - b[0]);
  root.append(el('div', { class: 'panel' }, el('h2', null, 'Coming up (estimated)'), el('table', null, el('tbody', null, upcoming.map(([ms, tx]) => el('tr', null, el('td', null, fmtD(ms, { dateOnly: true })), el('td', null, tx)))))));
  const d = new Date(now), key = (d.getMonth() + 1) * 100 + d.getDate();
  const ann = ANNIVERSARIES.slice().sort((a, b) => ((a.m * 100 + a.d - key + 1300) % 1300) - ((b.m * 100 + b.d - key + 1300) % 1300));
  root.append(el('div', { class: 'panel', style: 'margin-top:12px' }, el('h2', null, 'Anniversaries'), el('table', null, el('tbody', null, ann.map((a) => el('tr', null, el('td', null, `${String(a.m).padStart(2, '0')}-${String(a.d).padStart(2, '0')}`), el('td', null, `${a.text} (${a.y})`)))))));
  root.append(el('p', { class: 'dim' }, 'Conference listings are not built yet (needs a trusted data source).')); return root;
}
function viewGlossary() {
  const root = el('div'); root.append(el('h1', null, 'GLOSSARY'));
  root.append(el('dl', { class: 'glossary' }, GLOSSARY.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]))); return root;
}
function viewAbout() {
  const root = el('div'); root.append(el('h1', null, 'ABOUT'), el('div', { class: 'panel' },
    el('p', null, 'BLOCKHORIZON shows the Bitcoin chain as a clock: block height counts up, and everything else (halving, difficulty, fees) counts down to the next block.'),
    el('p', null, 'It is a static page. No account, no ads, no analytics, no cookies. Settings and the last values live only in this browser. Live data comes straight from the public mempool.space API.'),
    el('p', { class: 'dim' }, `Version ${VERSION}`), el('p', null, el('a', { href: 'https://github.com/Random21m/blockhorizon' }, 'Source on GitHub'), ' · ', el('a', { href: 'privacy.html' }, 'Privacy'))));
  const copy = async () => { try { await navigator.clipboard.writeText(TIP_ADDR); toast('Address copied'); } catch { const r = document.createRange(); r.selectNodeContents(addr); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Select and copy the address'); } };
  const addr = el('code', { id: 'tip-addr', class: 'tip-addr' }, TIP_ADDR);
  root.append(el('div', { class: 'panel support', id: 'support' }, el('h2', null, 'Support'),
    el('p', null, 'If BLOCKHORIZON is useful to you, you can send a tip over Lightning:'),
    el('img', { class: 'tip-qr', src: 'docs/support-qr.svg', alt: 'QR code for the Lightning address below', width: 220, height: 220 }),
    addr, el('p', { class: 'row' }, el('button', { id: 'tip-copy', onclick: copy }, 'Copy address'), el('a', { href: 'lightning:' + TIP_ADDR }, 'Open in wallet')),
    el('p', { class: 'dim' }, 'An npub.cash Lightning address: scan the QR code or paste the address into any Lightning wallet.')));
  return root;
}
let route = '/';
const VIEWS = { '/': viewDash, '/alarm': viewAlarm, '/calc': viewCalc, '/replay': viewReplay, '/events': viewEvents, '/glossary': viewGlossary, '/about': viewAbout };
function parseRoute() { const h = location.hash.replace(/^#/, '') || '/'; const m = h.match(/^\/block\/(\d+)$/); return m ? { path: '/block', arg: m[1] } : { path: VIEWS[h] ? h : '/' }; }
function renderNav(cur) { const nav = $('#nav'); nav.replaceChildren(...NAVS.map(([p, k]) => el('a', { href: '#' + p, 'aria-current': p === cur ? 'page' : false }, t(k)))); }
// Keep the block strips' horizontal scroll across live repaints. On phones both strips share one row (.strip2 scrolls),
// which opens at the divider so the next projected block and the latest mined block are both in view.
function stripScroll(saved) {
  const els = [$('.strip2'), ...document.querySelectorAll('.strip2 .blocks')].filter(Boolean);
  if (!saved) return els.map((e) => e.scrollLeft);
  els.forEach((e, i) => { e.scrollLeft = saved[i] || 0; });
  const s = els[0], g = s && s.children[1];
  if (s && g && !saved[0] && s.scrollWidth > s.clientWidth + 1) s.scrollLeft = g.offsetLeft - s.offsetLeft - s.clientWidth * 0.45;
}
function renderView() {
  const r = parseRoute(); route = r.path; const m = $('#main'); const y = scrollY;
  document.body.classList.toggle('fit', r.path === '/'); const v = r.path === '/block' ? viewBlock(r.arg) : VIEWS[r.path](); m.replaceChildren(v); if (r.path === '/') stripScroll([]); renderNav(r.path);
  document.title = 'BLOCKHORIZON' + (Number.isFinite(st.tip) ? ' · ' + L.fmtNum(st.tip) : ''); scrollTo(0, r.path === '/' ? y : 0);
}
let rendering = false;
function render() { // live updates only repaint the dashboard; other views keep their inputs
  if (route === '/' && !rendering) { rendering = true; try { const y = scrollY, sx = stripScroll(); renderView(); scrollTo(0, y); stripScroll(sx); } finally { rendering = false; } }
  else if (route !== '/') document.title = 'BLOCKHORIZON · ' + L.fmtNum(st.tip);
  const c = $('#conn'); if (c) { c.className = 'conn ' + (st.conn === 'on' ? 'on' : st.conn === 'poll' ? 'poll' : ''); c.title = st.conn === 'on' ? 'Live' : st.conn === 'poll' ? 'Polling' : t('offline'); }
}

// ---------- modals ----------
function openModal(node) { const m = $('#modal'); $('#modal-body').replaceChildren(node); m.hidden = false; const f = m.querySelector('input,select,button:not(.x)'); (f || $('#modal-x')).focus(); }
function closeModal() { $('#modal').hidden = true; }
function searchModal() {
  const hi = el('input', { id: 's-h', inputmode: 'numeric', placeholder: 'e.g. 840000', 'aria-label': t('byHeight') }), di = el('input', { id: 's-d', type: 'date', 'aria-label': t('byDate') }), msg = el('div', { class: 'dim', id: 's-msg' });
  const goH = (e) => { e.preventDefault(); const n = L.parseHeightInput(hi.value); if (!Number.isFinite(n) || (Number.isFinite(st.tip) && n > st.tip)) { msg.textContent = t('notFound'); return; } closeModal(); location.hash = '#/block/' + n; };
  const goD = async (e) => { e.preventDefault(); if (!di.value) return; const ts = Math.floor(Date.parse(di.value + 'T00:00:00Z') / 1000); if (!Number.isFinite(ts) || ts < 1231006505) { msg.textContent = t('notFound'); return; }
    msg.textContent = '…'; try { const r = await api.byTime(ts); closeModal(); location.hash = '#/block/' + r.height; } catch { msg.textContent = t('notFound'); } };
  openModal(el('div', null, el('h1', null, t('search').toUpperCase()), el('form', { class: 'row', onsubmit: goH }, el('label', null, t('byHeight') + ' '), hi, el('button', { class: 'btn-go', type: 'submit' }, t('go'))),
    el('form', { class: 'row', onsubmit: goD }, el('label', null, t('byDate') + ' (UTC) '), di, el('button', { class: 'btn-go', type: 'submit' }, t('go'))), msg));
}
function settingsModal() {
  const sel = (key, opts, onchg) => el('select', { id: 'st-' + key, onchange: (e) => { S[key] = e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value; save(); applyLook(); if (onchg) onchg(); renderView(); } },
    opts.map(([v, l]) => el('option', { value: String(v), selected: String(S[key]) === String(v) }, l)));
  const chk = (key, label) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'st-' + key, checked: !!S[key], onchange: (e) => { S[key] = e.target.checked; save(); applyLook(); renderView(); } }), label);
  const row = (l, c) => el('div', { class: 'row' }, el('label', { style: 'min-width:130px' }, l), c);
  const tabs = { display: () => el('div', null, row(t('theme'), sel('theme', [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']])), row(t('currency'), sel('cur', CURRENCIES.map((c) => [c, c]))),
      row('Sats symbol', sel('satsSym', [['sats', 'sats'], ['SATS', 'SATS'], ['sat', 'sat']])), row('Hashrate average', sel('hr', [['d7', '7 days'], ['d14', '14 days'], ['d30', '30 days'], ['d90', '90 days']])),
      chk('showFees', 'Show fees and mempool'), chk('feesRtl', 'Fees right to left'), chk('showPool', 'Show mining pool'), chk('showMoscow', 'Show Moscow time'), chk('showCap', 'Show market cap'),
      el('button', { onclick: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } }, 'Full screen')),
    format: () => el('div', null, row(t('language'), sel('lang', Object.entries(LANGS))), row('Time', sel('h12', [[false, '24-hour'], [true, '12-hour']])), row('Date', sel('dateFmt', [['iso', '2026-11-24'], ['dmy', '24.11.2026'], ['mdy', '11/24/2026']])), row('Zone', sel('utc', [[false, 'Local'], [true, 'UTC']]))),
    sounds: () => el('div', null, chk('sound', 'Sound on new block'), row('Block sound', sel('bsound', Object.entries(BLOCK_SOUNDS))), el('button', { onclick: () => play(S.bsound) }, '▶ Test'),
      chk('reduced', 'Reduce motion (no transitions)')) };
  const body = el('div'), bar2 = el('div', { class: 'tabs', role: 'tablist' });
  const show = (k) => { bar2.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k))); body.replaceChildren(tabs[k]()); };
  for (const k of Object.keys(tabs)) bar2.append(el('button', { role: 'tab', 'data-k': k, onclick: () => show(k) }, k[0].toUpperCase() + k.slice(1)));
  openModal(el('div', null, el('h1', null, t('settings').toUpperCase()), bar2, body, el('p', { class: 'dim' }, 'Settings are stored only in this browser.'))); show('display');
}

// ---------- boot ----------
function tickClock() { const s = $('#since'); if (s && st.blocks[0]) s.textContent = L.fmtDuration(Date.now() / 1000 - st.blocks[0].timestamp); }
export function boot() {
  applyLook(); $('#ver').textContent = 'BLOCKHORIZON ' + VERSION;
  $('#btn-search').onclick = searchModal; $('#btn-settings').onclick = settingsModal; $('#modal-x').onclick = closeModal;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  addEventListener('hashchange', renderView); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);
  renderView(); refreshAll();
  live(onLive, (s) => { st.conn = s; render(); });
  livePrice(onPriceTick, (on) => { if (st.priceLive !== on) { st.priceLive = on; render(); } });
  setInterval(tickClock, 1000); setInterval(refreshAll, 60000);
  pullToRefresh();
  $('#btn-refresh').onclick = hardRefresh;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // A new version takes over in the background: reload once so it shows straight away.
    const had = !!navigator.serviceWorker.controller; let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      // Installed apps are often resumed rather than reopened, so check for a new version (and fresh data) whenever the app comes back.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { reg.update().catch(() => {}); refreshAll(); } });
    }).catch(() => {});
  }
}
// Reload the page; the service worker fetches app files network-first, so this also picks up a new version.
function hardRefresh() { toast('Refreshing…'); location.reload(); }
// Pull down from the top to refresh: installed apps (iPhone home screen, Android standalone) have no browser pull-to-refresh.
function pullToRefresh() {
  const ind = el('div', { id: 'ptr', class: 'ptr', 'aria-hidden': 'true' }, '↓'); document.body.append(ind);
  const LIMIT = 80; let y0 = null, x0 = 0, d = 0;
  const reset = () => { y0 = null; d = 0; ind.style.transform = ''; ind.style.opacity = ''; ind.classList.remove('ready'); };
  addEventListener('touchstart', (e) => { if (e.touches.length !== 1 || scrollY > 0 || !$('#modal').hidden) return; y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; d = 0; }, { passive: true });
  // Browsers throttle touchmove once a drag counts as a scroll, so the lift-off point in touchend decides, not the last move.
  const pull = (pt) => {
    const dy = pt.clientY - y0, dx = pt.clientX - x0;
    if (dy <= 0 || Math.abs(dx) > dy || scrollY > 0) { if (dy < 0 || Math.abs(dx) > Math.abs(dy)) reset(); return; }
    d = Math.min(dy * 0.5, LIMIT * 1.4); ind.style.transform = `translate(-50%, ${d}px) rotate(${d * 2.5}deg)`; ind.style.opacity = String(Math.min(1, d / LIMIT));
    ind.textContent = d >= LIMIT ? '↻' : '↓'; ind.classList.toggle('ready', d >= LIMIT);
  };
  addEventListener('touchmove', (e) => { if (y0 !== null) pull(e.touches[0]); }, { passive: true });
  addEventListener('touchend', (e) => { if (y0 !== null && e.changedTouches[0]) pull(e.changedTouches[0]); if (y0 !== null && d >= LIMIT) { ind.textContent = '↻'; ind.classList.add('spin'); hardRefresh(); return; } reset(); });
  addEventListener('touchcancel', reset);
}
if (typeof document !== 'undefined') boot();
