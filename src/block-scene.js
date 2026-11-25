// The block being mined, drawn live: every transaction in the next projected block as a square (area = its size, colour =
// its fee rate, highest fees at the bottom), from mempool.space's live feed.
// Calm on purpose: squares that are already drawn stay where they are. Each update (batched, at most one a second) fades
// out the ones that left and drops the new ones into free space near their fee band. Only now and then (a new block, no
// room left, or every 30 s once holes pile up) is the whole block re-sorted, as one slow glide. When the block is found
// it turns mined purple and slides away to the right while the next one fills in from the bottom.
// No live feed (polling, offline): a stand-in with the projected block's count, size and fee spread, marked approximate.
// Reduced motion (setting or system) or a hidden tab: everything jumps straight to its place.
import * as L from './lib.js';
import { S, st } from './state.js';

const MOVE = 900, FADE = 450, SEAL = 2200, BATCH = 1000, RESORT = 30000, EASE = (k) => 1 - (1 - k) ** 3;
const txs = new Map(); let liveData = false, version = 0, approxKey = '', approxList = [];
let grid = 75, unit = 1e6 / 5625, placed = new Map(), sprites = new Map(), leaving = [], sealed = null;
let applied = -1, appliedAt = 0, sortedAt = 0, needSort = true, shownTip = NaN, misplaced = 0;
let canvas = null, ctx = null, tip = null, raf = 0, timer = 0, hover = null, ro = null, ink = '#fff';
const still = () => S.reduced || document.hidden || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// A projected-block-transactions frame from the live feed (a full list starts the block over, deltas change it).
export function ingest(frame) { if ((frame && frame.blockTransactions) || !liveData) needSort = true; L.applyBlockFrame(txs, frame); liveData = true; version++; schedule(); }
export function liveFeed() { return liveData; }
export function sceneStats() { const list = source(); return { n: list.length, vsize: list.reduce((a, t) => a + t.vsize, 0), live: liveData }; }
function source() {
  if (liveData) return [...txs.values()];
  const pb = st.proj && st.proj[0], key = pb ? String(st.tip) : ''; // rebuilt for a new block only, so it holds still
  if (key !== approxKey) { approxKey = key; approxList = L.approxBlock(pb, (st.tip || 1) * 7919); needSort = true; version++; }
  return approxList;
}
// Updates arrive about once a second; apply them together, never more often than BATCH.
function schedule() { if (!canvas || timer) return; const wait = Math.max(0, appliedAt + BATCH - performance.now()); timer = setTimeout(() => { timer = 0; kick(); }, wait); }

function sprite(p, now, enter) { // enter: 'fill' (first fill, bottom up), 'drop' (a new one), or nothing (no animation)
  const sp = { x: p.x, y: p.y, s: p.s, fx: p.x, fy: p.y, fs: p.s, t0: -1e9, born: -1e9, c: L.feeColor(p.rate), p };
  if (enter === 'fill') { sp.born = now + Math.min(1200, p.y / grid * 1100 + Math.random() * 100); sp.fy = p.y + 3; sp.t0 = sp.born; }
  else if (enter === 'drop') { sp.born = now; sp.fy = p.y + 2; sp.t0 = now; }
  return sp;
}
const pos = (sp, now) => { const k = EASE(Math.min(1, Math.max(0, (now - sp.t0) / MOVE))); return { x: sp.fx + (sp.x - sp.fx) * k, y: sp.fy + (sp.y - sp.fy) * k, s: sp.fs + (sp.s - sp.fs) * k }; };

function update(now) {
  const list = source(); applied = version; appliedAt = now; const jump = still();
  const ids = new Map(list.map((t) => [t.id, t]));
  // gone: fade out where they stand
  for (const [id, sp] of sprites) if (!ids.has(id)) { sprites.delete(id); placed.delete(id); if (!jump) { const q = pos(sp, now); leaving.push({ x: q.x, y: q.y, s: q.s, c: sp.c, t0: now }); } }
  // fee rate changed (bumped): recolour in place
  for (const [id, sp] of sprites) { const t = ids.get(id); if (t && t.rate !== sp.p.rate) { sp.p = Object.assign({}, sp.p, { rate: t.rate }); sp.c = L.feeColor(t.rate); placed.set(id, sp.p); } }
  if (!needSort) {
    const adds = list.filter((t) => !placed.has(t.id));
    if (adds.length) { const r = L.fitInto([...placed.values()], adds, grid, unit); for (const p of r.placed) { if (p.misplaced) misplaced++; placed.set(p.id, p); sprites.set(p.id, sprite(p, now, jump ? null : 'drop')); } if (r.left.length) needSort = true; }
    if (misplaced > 25 && now - sortedAt > RESORT / 3) needSort = true; // new ones parked away from their fee band: tidy up sooner
    if (now - sortedAt > RESORT) { // holes left by transactions that went: tidy up once they add up
      let a = 0; for (const p of placed.values()) a += p.s * p.s; const want = grid * grid * 0.94 * Math.min(1, list.reduce((v, t) => v + t.vsize, 0) / 1e6);
      if ((want > 0 && a / want < 0.88) || misplaced) needSort = true;
    }
  }
  if (needSort) resort(list, now, jump);
}
function resort(list, now, jump) {
  const first = !sprites.size, g = Math.min(160, Math.max(75, Math.ceil(Math.sqrt(list.length * 1.6) / 5) * 5));
  if (g !== grid && !first) { const r = g / grid; for (const sp of sprites.values()) { const q = pos(sp, now); Object.assign(sp, { x: q.x * r, y: q.y * r, s: q.s * r, fx: q.x * r, fy: q.y * r, fs: q.s * r, t0: -1e9 }); } }
  grid = g; const lay = L.packBlock(list, grid); unit = lay.unit; placed = new Map(lay.map((p) => [p.id, p])); needSort = false; sortedAt = now; misplaced = 0;
  const next = new Map();
  for (const p of lay) {
    const sp = sprites.get(p.id);
    if (sp) { const q = pos(sp, now); Object.assign(sp, { fx: q.x, fy: q.y, fs: q.s, x: p.x, y: p.y, s: p.s, t0: jump ? -1e9 : now, p, c: L.feeColor(p.rate) }); next.set(p.id, sp); }
    else next.set(p.id, sprite(p, now, jump ? null : first ? 'fill' : 'drop'));
  }
  if (!jump) for (const [id, sp] of sprites) if (!next.has(id)) { const q = pos(sp, now); leaving.push({ x: q.x, y: q.y, s: q.s, c: sp.c, t0: now }); }
  sprites = next;
}
function blockFound(now) { // snapshot what was there, tinted mined purple-to-blue by height, and send it off; the next one fills in
  if (!still() && sprites.size) sealed = { items: [...sprites.values()].map((sp) => ({ x: sp.x, y: sp.y, s: sp.s, c: sp.c })), g: grid, t0: now };
  sprites = new Map(); placed = new Map(); leaving = []; needSort = true; applied = -1;
}
function mix(a, b, k) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`; }
function frame(now) {
  raf = 0; if (!canvas || !canvas.isConnected) { unmount(); return; }
  if (Number.isFinite(shownTip) && st.tip > shownTip) blockFound(now);
  if (Number.isFinite(st.tip)) shownTip = st.tip;
  source(); if (applied !== version) { if (!sprites.size || now - appliedAt >= BATCH) update(now); else schedule(); }
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr); if (!w) return;
  if (canvas.width !== w || canvas.height !== w) { canvas.width = w; canvas.height = w; }
  const cell = w / grid, gap = cell >= 4 ? Math.max(1, dpr * 0.6) : cell >= 2.5 ? 0.5 : 0; let busy = false;
  ctx.clearRect(0, 0, w, w);
  const rect = (x, y, s, g = grid, c = cell) => ctx.fillRect(x * c + gap / 2, (g - y - s) * c + gap / 2, Math.max(0.6, s * c - gap), Math.max(0.6, s * c - gap));
  // settled squares in one pass per colour (cheap), then the ones still moving or fading in
  // one pass per colour for everything fully visible (settled or gliding); only squares fading in need their own alpha
  const fading = [], byColour = new Map();
  for (const sp of sprites.values()) {
    const moving = now - sp.t0 < MOVE; if (moving) busy = true;
    if (now - sp.born < FADE) { busy = true; if (now >= sp.born) fading.push(sp); continue; }
    let a = byColour.get(sp.c); if (!a) byColour.set(sp.c, a = []);
    if (moving) { const k = EASE((now - sp.t0) / MOVE); sp.cx = sp.fx + (sp.x - sp.fx) * k; sp.cy = sp.fy + (sp.y - sp.fy) * k; sp.cs = sp.fs + (sp.s - sp.fs) * k; } else { sp.cx = sp.x; sp.cy = sp.y; sp.cs = sp.s; }
    a.push(sp);
  }
  ctx.globalAlpha = 1;
  for (const [c, a] of byColour) { ctx.fillStyle = c; for (const q of a) rect(q.cx, q.cy, q.cs); }
  for (const sp of fading) { const q = pos(sp, now); ctx.globalAlpha = Math.min(1, (now - sp.born) / FADE); ctx.fillStyle = sp.c; rect(q.x, q.y, q.s); }
  leaving = leaving.filter((q) => { const k = (now - q.t0) / FADE; if (k >= 1) return false; busy = true; ctx.globalAlpha = 1 - EASE(k); ctx.fillStyle = q.c; rect(q.x, q.y, q.s); return true; });
  if (sealed) { // 0-35%: turn mined purple; 35-100%: slide right and fade
    const k = (now - sealed.t0) / SEAL; if (k >= 1) sealed = null; else {
      busy = true; const tint = Math.min(1, k / 0.35), m = EASE(Math.max(0, (k - 0.35) / 0.65)), c2 = w / sealed.g;
      ctx.save(); ctx.translate(m * w * 0.9, 0); ctx.globalAlpha = 1 - m;
      for (const q of sealed.items) { const to = q.y / sealed.g > 0.5 ? L.MINED_TOP : L.MINED_BOTTOM; ctx.fillStyle = tint < 1 ? mix(q.c, to, tint) : to; rect(q.x, q.y, q.s, sealed.g, c2); }
      ctx.restore(); } }
  if (hover && placed.get(hover.id) === hover) { ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, dpr * 1.5); ctx.strokeRect(hover.x * cell, (grid - hover.y - hover.s) * cell, hover.s * cell, hover.s * cell); }
  ctx.globalAlpha = 1;
  if (busy) kick();
}
function kick() { if (!raf && canvas) raf = requestAnimationFrame(frame); }
function pick(e) {
  const r = canvas.getBoundingClientRect(), gx = (e.clientX - r.left) / r.width * grid, gy = grid - (e.clientY - r.top) / r.height * grid;
  for (const p of placed.values()) if (gx >= p.x && gx < p.x + p.s && gy >= p.y && gy < p.y + p.s) return p;
  return null;
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
  host.replaceChildren(canvas, tip); sprites = new Map(); placed = new Map(); leaving = []; sealed = null; needSort = true; applied = -1; shownTip = st.tip;
  ink = getComputedStyle(canvas).color || '#fff';
  canvas.addEventListener('pointermove', showTip); canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; kick(); });
  canvas.addEventListener('click', (e) => { const p = pick(e); if (p && liveData) location.hash = '#/tx/' + p.id; });
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => kick()); ro.observe(canvas); }
  kick();
}
function unmount() { if (ro) ro.disconnect(); ro = null; canvas = null; ctx = null; hover = null; if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(timer); timer = 0; }
export const sceneMounted = () => !!(canvas && canvas.isConnected);
