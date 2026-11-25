// BLOCKHORIZON entry point: routing, live repaint, boot.
import * as L from './lib.js';
import { live } from './api.js';
import { livePrice } from './price.js';
import { t } from './i18n.js';
import { VERSION, $, st, el, toast, applyLook, NAVS, hooks } from './state.js';
import { refreshAll, onLive, onPriceTick, checkAlarms, checkFeeAlerts } from './data.js';
import { sinceText } from './ui.js';
import { viewDash, viewClock } from './view-dash.js';
import { viewBlock, viewTx } from './view-chain.js';
import { viewAlarm, viewCalc, paintFeeNow } from './view-tools.js';
import { viewCharts } from './view-charts.js';
import { measure, arrive } from './arrival.js';
import { viewReplay, viewEvents, viewGlossary, viewWatch, viewAbout } from './view-info.js';
import { closeModal, searchModal, settingsModal, trapFocus } from './modals.js';

let route = '/';
const VIEWS = { '/': viewDash, '/clock': viewClock, '/alarm': viewAlarm, '/calc': viewCalc, '/charts': viewCharts, '/replay': viewReplay, '/events': viewEvents, '/glossary': viewGlossary, '/watch': viewWatch, '/about': viewAbout };
const LIVE = { '/': 'dashgrid', '/clock': 'clockview' }; // views repainted on every live update (the others keep their inputs)
function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  let m = h.match(/^\/block\/(\d+)$/); if (m) return { path: '/block', arg: m[1] };
  m = h.match(/^\/tx\/([0-9a-fA-F]{64})$/); if (m) return { path: '/tx', arg: m[1].toLowerCase() };
  return { path: VIEWS[h] ? h : '/' };
}
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
const docTitle = () => 'BLOCKHORIZON' + (Number.isFinite(st.tip) ? ' · ' + L.fmtNum(st.tip) : '');
function renderView() {
  // #/search (the app's Search shortcut) opens the dashboard with the search dialog
  if (location.hash === '#/search') { history.replaceState(null, '', '#/'); queueMicrotask(searchModal); }
  const r = parseRoute(); route = r.path; const m = $('#main'); const y = scrollY;
  document.body.classList.toggle('fit', r.path === '/'); document.body.classList.toggle('clockmode', r.path === '/clock'); keepAwake(r.path === '/clock');
  const v = r.path === '/block' ? viewBlock(r.arg) : r.path === '/tx' ? viewTx(r.arg) : VIEWS[r.path](); m.replaceChildren(v); if (r.path === '/') stripScroll([]); renderNav(r.path);
  document.title = docTitle(); scrollTo(0, r.path === '/' ? y : 0);
}
// Make the live node `a` match the freshly built node `b`, touching only what differs: unchanged text and elements stay
// in place, so hover, keyboard focus, screen readers and the strips' scroll are left alone by live updates.
function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
  if (a.nodeType === 3) { if (a.data !== b.data) a.data = b.data; return; }
  if (a.nodeType !== 1) return;
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  const ak = [...a.childNodes], bk = [...b.childNodes];
  bk.forEach((n, i) => { if (ak[i]) morph(ak[i], n); else a.append(n); });
  for (let i = bk.length; i < ak.length; i++) ak[i].remove();
}
// What the live view last showed: the height and the newest mined block. They can arrive in separate updates (the minute
// refresh fetches them separately), so each animates when its own data lands.
let rendering = false, shownTip = NaN, shownTop = NaN;
function render() {
  if (LIVE[route] && !rendering) {
    rendering = true;
    try { const cur = $('#main').firstElementChild;
      if (!cur || !cur.classList.contains(LIVE[route])) renderView();
      else {
        const top = st.blocks[0] ? st.blocks[0].height : NaN, moved = { height: st.tip > shownTip, blocks: top > shownTop };
        const before = moved.height || moved.blocks ? measure() : null; // a new block: remember where everything stood
        const sx = stripScroll(); morph(cur, VIEWS[route]()); stripScroll(sx); document.title = docTitle(); arrive(before, moved);
      }
      shownTip = st.tip; shownTop = st.blocks[0] ? st.blocks[0].height : NaN;
    } finally { rendering = false; } }
  else if (!LIVE[route]) document.title = 'BLOCKHORIZON · ' + L.fmtNum(st.tip);
  checkAlarms(); checkFeeAlerts(); paintFeeNow();
  const c = $('#conn'); if (c) { c.className = 'conn ' + (st.conn === 'on' ? 'on' : st.conn === 'poll' ? 'poll' : ''); c.title = st.conn === 'on' ? t('connLive') : st.conn === 'poll' ? t('connPoll') : t('offline'); }
}

let wake = null;
async function keepAwake(on) { // Screen Wake Lock: released by the browser when the page is hidden, so it is asked for again on return
  try {
    if (on && !wake && !document.hidden && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch { wake = null; }
}
// Copy link and (where the system offers it) Share for a block or transaction page.
// ---------- boot ----------
function tickClock() { const s = $('#since'); if (s && st.blocks[0]) s.textContent = sinceText(Date.now()); }
export function boot() {
  hooks.render = render; hooks.renderView = renderView;
  applyLook(); $('#ver').textContent = 'BLOCKHORIZON ' + VERSION;
  $('#btn-search').onclick = searchModal; $('#btn-settings').onclick = settingsModal; $('#modal-x').onclick = closeModal;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  addEventListener('keydown', trapFocus);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (route === '/clock') location.hash = '#/'; } });
  addEventListener('hashchange', renderView); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(route === '/clock'); });
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
function hardRefresh() { toast(t('refreshing')); location.reload(); }
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
