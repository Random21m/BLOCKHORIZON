// Building blocks for the views: tiles, charts, block cubes, the price line, share buttons.
import * as L from './lib.js';

import { t } from './i18n.js';
import { source, getServer } from './api.js';
import { S, st, el, toast, price, priceStr } from './state.js';

// ---------- views ----------
export const kv = (rows) => el('dl', { class: 'kv' }, rows.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]));
export const bar = (p) => el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${Math.max(0, Math.min(1, p)) * 100}%` }));
export function arc(p, big, sub) {
  const r = 70, c = Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, p)));
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 180 110'); s.setAttribute('class', 'arc'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', `${(p * 100).toFixed(1)}%`);
  s.innerHTML = `<path class="trk" d="M20 90 A70 70 0 0 1 160 90"/><path class="val" d="M20 90 A70 70 0 0 1 160 90" stroke-dasharray="${c}" stroke-dashoffset="${off}"/><text x="90" y="82"></text><text class="sub" x="90" y="100"></text>`;
  s.querySelectorAll('text')[0].textContent = big; s.querySelectorAll('text')[1].textContent = sub; return s;
}
export function spark(vals) {
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
export const NS = 'http://www.w3.org/2000/svg';
export function chart(w, h, inner, label) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); s.innerHTML = inner;
  return el('div', { class: 'chartbox' }, s);
}
export function gapsChart(blocks) {
  const b = (blocks || []).slice().sort((x, y) => x.height - y.height).slice(-16), gaps = [];
  for (let i = 1; i < b.length; i++) gaps.push(Math.max(0, b[i].timestamp - b[i - 1].timestamp));
  if (gaps.length < 2) return null;
  const w = 320, h = 80, max = Math.max(1200, ...gaps), bw = w / gaps.length, y600 = h - 600 / max * h;
  const bars = gaps.map((g, i) => { const bh = Math.max(2, g / max * h); return `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${bh.toFixed(1)}" fill="${g >= 600 ? 'var(--accent)' : 'var(--dim)'}"/>`; }).join('');
  return chart(w, h, bars + `<line x1="0" x2="${w}" y1="${y600.toFixed(1)}" y2="${y600.toFixed(1)}" stroke="var(--text)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`, t('gapsAria'));
}
export function emissionChart(epoch) {
  const w = 320, h = 80, n = 12, bw = w / n;
  const bars = Array.from({ length: n }, (_, e) => { const bh = Math.max(2, 50 / 2 ** e / 50 * (h - 2)); return `<rect x="${(e * bw + 2).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="${e === epoch ? 'var(--accent)' : e < epoch ? 'var(--dim)' : 'var(--line)'}"/>`; }).join('');
  return chart(w, h, bars, t('emissionAria'));
}
export const stack = (segs) => el('div', { class: 'stack' }, segs.map((x) => el('i', { style: `flex:${x.v};background:${x.c}`, title: x.label })));
export function feeBands(hist) {
  const br = [0, 1, 2, 3, 5, 8, 12, 20, 30, 50, 100, 300], sums = br.map(() => 0);
  for (const [f, v] of hist || []) { let i = 0; for (let k = 0; k < br.length; k++) if (f >= br[k]) i = k; sums[i] += v; }
  return br.map((b, i) => ({ v: sums[i], c: L.feeColor(b), label: `${b}+ sat/vB` })).filter((x) => x.v > 0);
}
export const minis = (rows) => el('div', { class: 'minis' }, rows.filter(Boolean).map(([k, v]) => el('div', { class: 'mini' }, el('small', null, k), el('b', null, v))));
export const cube = (p, fill, base) => el('div', { class: 'cube', style: `background:${base}` }, el('i', { style: `height:${Math.max(4, Math.min(100, p * 100)).toFixed(0)}%;background:${fill}` }));
export const minedCube = (x) => cube((x.weight || 0) / 4e6, `linear-gradient(${L.MINED_TOP}, ${L.MINED_BOTTOM})`, L.MINED_EMPTY);
export const upcomingCube = (b) => cube((b.blockVSize || 0) / 1e6, L.feeStripes(b.feeRange), L.UPCOMING_EMPTY);
export const more = (x) => el('span', { class: 'more' }, x);
export const less = (x) => el('span', { class: 'less' }, x); // the shorter wording, shown instead of .more below 900px
export const pct24 = () => (st.pct[S.cur] >= 0 ? '▲ ' : '▼ ') + L.fmtNum(Math.abs(st.pct[S.cur]), 2) + '%';
// title is a string, or [full, short]: the short one is shown instead below 900px, where tiles are narrow.
export function tile(cls, title, value, subs = [], extra) {
  const h = Array.isArray(title) && title[1] !== title[0] ? [el('span', { class: 'tfull' }, title[0]), el('span', { class: 'tshort' }, title[1])] : [].concat(title)[0];
  return el('section', { class: 'tile ' + cls }, el('h2', null, h), el('div', { class: 'tv' }, value), ...[].concat(extra || []), ...subs.filter(Boolean).map((x, i) => el('div', { class: 'ts s' + i }, x)));
}
// The big price line under the block height (dashboard and clock).
export function priceLine() {
  const p = price(); if (!Number.isFinite(p)) return null;
  return el('div', { class: 'btc' }, el('b', { id: 'btc' }, priceStr(st.shownCur === S.cur && Number.isFinite(st.shown) ? st.shown : p)),
    // one arrow only, the 24 h change (a second arrow for the last trade read as a contradiction next to it)
    st.pct[S.cur] != null ? el('span', { class: 'chg ' + (st.pct[S.cur] >= 0 ? 'up' : 'down') }, pct24() + ' ' + t('h24')) : null, el('span', { class: 'src' }, st.priceLive ? t('live') + ' · Kraken' : srcHost()));
}
// The data host that answered last, for the 'where is this from' labels (mempool.space, your node, or the backup).
export const srcHost = () => { try { return new URL(source || getServer()).host; } catch { return 'mempool.space'; } };
export const sinceText = (now) => st.blocks[0] ? L.fmtDuration(now / 1000 - st.blocks[0].timestamp) : '–';
export function shareRow(path, title) {
  const url = location.href.split('#')[0] + '#' + path;
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { toast(url); } };
  return el('div', { class: 'row share' }, el('button', { class: 'btn-copy', onclick: copy }, t('copyLink')),
    navigator.share ? el('button', { class: 'btn-share', onclick: () => navigator.share({ title, url }).catch(() => {}) }, t('share')) : null);
}
