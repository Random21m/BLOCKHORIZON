// The block being mined, drawn live: every transaction in the next projected block as a square (area = its size, colour =
// its fee rate, highest fees at the bottom), from mempool.space's live feed. New transactions drop in from the top and
// settle, ones that leave fade out, and everything glides when the order changes. When the block is found, it turns
// mined purple and slides away to the right (towards the mined blocks) while the next one starts to fill.
// No live feed (polling, offline): a stand-in with the projected block's count, size and fee spread, marked approximate.
// Reduced motion (setting or system) or a hidden tab: everything jumps straight to its place.
import * as L from './lib.js';
import { S, st } from './state.js';

const DUR = 750, SEAL = 2200, EASE = (k) => 1 - (1 - k) ** 3;
const txs = new Map(); let liveData = false, version = 0;
let layout = [], grid = 75, sprites = new Map(), leaving = [], sealed = null, laidFor = -1, approxKey = '';
let canvas = null, ctx = null, tip = null, raf = 0, shownTip = NaN, hover = null, ro = null;
const still = () => S.reduced || document.hidden || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// A projected-block-transactions frame from the live feed.
export function ingest(frame) { L.applyBlockFrame(txs, frame); liveData = true; version++; kick(); }
export function liveFeed() { return liveData; }
export function sceneStats() { const list = source(); return { n: list.length, vsize: list.reduce((a, t) => a + t.vsize, 0), live: liveData }; }
function source() {
  if (liveData) return [...txs.values()];
  const pb = st.proj && st.proj[0], key = pb ? `${st.tip}:${pb.nTx}:${Math.round(pb.blockVSize)}` : '';
  if (key !== approxKey) { approxKey = key; source.cache = L.approxBlock(pb, (st.tip || 1) * 7919); }
  return source.cache || [];
}
function relayout(now) {
  const list = source(), g = Math.min(160, Math.max(75, Math.ceil(Math.sqrt(list.length * 1.6) / 5) * 5));
  if (g !== grid) { const r = g / grid; for (const sp of sprites.values()) for (const k of ['fx', 'fy', 'fs', 'tx', 'ty', 'ts']) sp[k] *= r; } // a finer grid: keep everything where it is on screen
  grid = g; layout = L.packBlock(list, grid); laidFor = version;
  const jump = still(), seen = new Set();
  layout.forEach((p) => {
    seen.add(p.id); const c = L.feeColor(p.rate), sp = sprites.get(p.id);
    if (sp) { const k = EASE(Math.min(1, Math.max(0, (now - sp.t0) / DUR))); Object.assign(sp, { fx: sp.fx + (sp.tx - sp.fx) * k, fy: sp.fy + (sp.ty - sp.fy) * k, fs: sp.fs + (sp.ts - sp.fs) * k, tx: p.x, ty: p.y, ts: p.s, c, t0: jump ? -1e9 : now }); }
    else sprites.set(p.id, { fx: p.x, fy: grid + 2 + p.y * 0.15, fs: p.s, tx: p.x, ty: p.y, ts: p.s, c, t0: jump ? -1e9 : now + Math.min(900, p.y * 9 + Math.random() * 120), p });
    sprites.get(p.id).p = p;
  });
  for (const [id, sp] of sprites) if (!seen.has(id)) { sprites.delete(id); if (!jump) leaving.push({ x: sp.tx, y: sp.ty, s: sp.ts, c: sp.c, t0: now }); }
}
function blockFound(now) { // snapshot what was there, tinted mined purple-to-blue by height, and send it off
  if (!still() && sprites.size) sealed = { items: [...sprites.values()].map((sp) => ({ x: sp.tx, y: sp.ty, s: sp.ts, c: sp.c })), g: grid, t0: now };
  sprites = new Map(); leaving = []; approxKey = ''; laidFor = -1;
}
function mix(a, b, k) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`; }
function frame(now) {
  raf = 0; if (!canvas || !canvas.isConnected) { unmount(); return; }
  if (Number.isFinite(shownTip) && st.tip > shownTip) blockFound(now);
  if (Number.isFinite(st.tip)) shownTip = st.tip;
  if (laidFor !== version || !layout.length || (!liveData && approxKey !== (st.proj && st.proj[0] ? `${st.tip}:${st.proj[0].nTx}:${Math.round(st.proj[0].blockVSize)}` : ''))) relayout(now);
  const dpr = devicePixelRatio || 1, w = Math.round(canvas.clientWidth * dpr); if (!w) return;
  if (canvas.width !== w || canvas.height !== w) { canvas.width = w; canvas.height = w; }
  const cell = w / grid, gap = cell >= 4 ? Math.max(1, dpr * 0.6) : cell >= 2.5 ? 0.5 : 0; let busy = false;
  ctx.clearRect(0, 0, w, w); ctx.globalAlpha = 1;
  const rect = (x, y, s, g = grid, c = cell) => ctx.fillRect(x * c + gap / 2, (g - y - s) * c + gap / 2, Math.max(0.6, s * c - gap), Math.max(0.6, s * c - gap));
  for (const sp of sprites.values()) {
    const k0 = (now - sp.t0) / DUR, k = EASE(Math.min(1, Math.max(0, k0))); if (k0 < 1) busy = true;
    const x = sp.fx + (sp.tx - sp.fx) * k, y = sp.fy + (sp.ty - sp.fy) * k, s = sp.fs + (sp.ts - sp.fs) * k;
    ctx.globalAlpha = k0 < 0 ? 0 : Math.min(1, 0.25 + k * 1.2); ctx.fillStyle = sp.c; rect(x, y, s);
  }
  leaving = leaving.filter((q) => { const k = (now - q.t0) / DUR; if (k >= 1) return false; busy = true; ctx.globalAlpha = 1 - k; ctx.fillStyle = q.c; rect(q.x, q.y, q.s); return true; });
  if (sealed) { // 0-35%: turn mined purple; 35-100%: slide right and fade
    const k = (now - sealed.t0) / SEAL; if (k >= 1) sealed = null; else {
      busy = true; const tint = Math.min(1, k / 0.35), m = EASE(Math.max(0, (k - 0.35) / 0.65)), c2 = w / sealed.g;
      ctx.save(); ctx.translate(m * w * 0.9, m * w * 0.06); ctx.globalAlpha = 1 - m;
      for (const q of sealed.items) { ctx.fillStyle = tint < 1 ? mix(q.c, (q.y / sealed.g > 0.5 ? L.MINED_TOP : L.MINED_BOTTOM), tint) : (q.y / sealed.g > 0.5 ? L.MINED_TOP : L.MINED_BOTTOM); rect(q.x, q.y, q.s, sealed.g, c2); }
      ctx.restore(); } }
  if (hover) { ctx.globalAlpha = 1; ctx.strokeStyle = getComputedStyle(canvas).color; ctx.lineWidth = Math.max(1.5, dpr * 1.5); ctx.strokeRect(hover.x * cell, (grid - hover.y - hover.s) * cell, hover.s * cell, hover.s * cell); }
  ctx.globalAlpha = 1;
  if (busy) kick();
}
function kick() { if (!raf && canvas) raf = requestAnimationFrame(frame); }
function pick(e) {
  const r = canvas.getBoundingClientRect(), gx = (e.clientX - r.left) / r.width * grid, gy = grid - (e.clientY - r.top) / r.height * grid;
  return layout.find((p) => gx >= p.x && gx < p.x + p.s && gy >= p.y && gy < p.y + p.s) || null;
}
function showTip(e) {
  const p = pick(e); if (p !== hover) { hover = p; kick(); }
  if (!p) { tip.hidden = true; canvas.style.cursor = ''; return; }
  const r = canvas.getBoundingClientRect();
  tip.textContent = `${L.fmtFee(p.rate)} sat/vB · ${L.fmtNum(Math.round(p.vsize))} vB` + (liveData && p.fee ? ` · ${L.fmtNum(p.fee)} sats` : '') + (liveData ? '\n' + p.id.slice(0, 16) + '…' : '');
  tip.hidden = false; tip.style.left = Math.min(r.width - tip.offsetWidth, Math.max(0, e.clientX - r.left + 12)) + 'px'; tip.style.top = Math.max(0, e.clientY - r.top - tip.offsetHeight - 10) + 'px';
  canvas.style.cursor = liveData ? 'pointer' : '';
}
// Put the canvas into the page's #scene holder (the live repaint keeps that holder untouched, see data-keep in app.js).
export function mountScene() {
  const host = document.getElementById('scene'); if (!host) return;
  if (canvas && canvas.parentNode === host) { kick(); return; }
  unmount(); canvas = document.createElement('canvas'); canvas.className = 'scene'; ctx = canvas.getContext('2d');
  tip = document.createElement('div'); tip.className = 'scene-tip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
  host.replaceChildren(canvas, tip); sprites = new Map(); leaving = []; sealed = null; laidFor = -1; shownTip = st.tip;
  canvas.addEventListener('pointermove', showTip); canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; kick(); });
  canvas.addEventListener('click', (e) => { const p = pick(e); if (p && liveData) location.hash = '#/tx/' + p.id; });
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => kick()); ro.observe(canvas); }
  kick();
}
function unmount() { if (ro) ro.disconnect(); ro = null; canvas = null; ctx = null; hover = null; if (raf) cancelAnimationFrame(raf); raf = 0; }
export const sceneMounted = () => !!(canvas && canvas.isConnected);
