// BLOCKHORIZON entry point: routing, live repaint, boot.
import * as L from './lib.js';
import { live, trackBlock, loadConfig, setServer, reconnect, store, source, FALLBACK } from './api.js';
import { mountScene, dropLive } from './block-scene.js';
import { livePrice } from './price.js';
import { t, getLang, loadLang } from './i18n.js';
import { VERSION, $, S, st, el, toast, applyLook, NAVS, PHONE_TABS, NAV_ICONS, hooks } from './state.js';
import {
  refreshAll,
  newGeneration,
  onLive,
  onPriceTick,
  checkAlarms,
  checkFeeAlerts,
  checkTxAlerts,
  checkAddrAlerts,
  resetAlarmTip,
} from './data.js';
import { sinceText, srcHost } from './ui.js';
import { initPush, ownNode } from './push.js';
import { viewDash, viewClock, finalText, clockOpts, clockSince, staleText } from './view-dash.js';
import { viewBlock, viewTx } from './view-chain.js';
import { viewAlarm, viewCalc, paintFeeNow } from './view-tools.js';
import { viewCharts } from './view-charts.js';
import { viewMy, paintMySince } from './view-my.js';
import { viewMining, paintMining } from './view-mining.js';
import { measure, arrive } from './arrival.js';
import { viewReplay, viewEvents, viewGlossary, viewWatch, viewAbout } from './view-info.js';
import { closeModal, openModal, searchModal, settingsModal, trapFocus } from './modals.js';

let route = '/',
  routeArg = '';
const VIEWS = {
  '/': viewDash,
  '/clock': viewClock,
  '/mining': viewMining,
  '/alarm': viewAlarm,
  '/calc': viewCalc,
  '/charts': viewCharts,
  '/replay': viewReplay,
  '/events': viewEvents,
  '/glossary': viewGlossary,
  '/watch': viewWatch,
  '/about': viewAbout,
};
const LIVE = { '/': 'dashgrid', '/clock': 'clockview', '/mining': 'minegrid' }; // views repainted on every live update (the others keep their inputs)
function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  let m = h.match(/^\/block\/(\d+)$/);
  if (m) return { path: '/block', arg: m[1] };
  m = h.match(/^\/tx\/([0-9a-fA-F]{64})$/);
  if (m) return { path: '/tx', arg: m[1].toLowerCase() };
  m = h.match(/^\/my(?:\?(.*))?$/);
  if (m) return { path: '/my', arg: m[1] || '' };
  m = h.match(/^\/clock\?(.*)$/);
  if (m) return { path: '/clock', arg: m[1] }; // display options: #/clock?kiosk&eink
  m = h.match(/^\/mining(?:\?(.*))?$/);
  if (m) return { path: '/mining', arg: m[1] || '' }; // a transaction to follow travels in the link // 'Your block': the date travels in the link
  return { path: VIEWS[h] ? h : '/' };
}
const navIco = (d) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'nico');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
};
// Desktop: one row of pages; those that do not fit (narrow windows, long languages) move into 'More'. Phones (CSS): four tabs along the bottom and 'More' for the rest.
// 'More' is highlighted when the open page is one of those it holds.
let navLang = '';
function renderNav(cur) {
  const nav = $('#nav');
  if (navLang === getLang() && nav.children.length) {
    // same links: only move the highlight, so a focused link keeps its focus
    nav.querySelectorAll('a').forEach((a) => {
      if (a.getAttribute('href') === '#' + cur) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    fitNav();
    return;
  }
  navLang = getLang();
  nav.replaceChildren(
    ...NAVS.map(([p, k]) =>
      el(
        'a',
        { href: '#' + p, class: PHONE_TABS.includes(p) ? 'tab' : 'xtra', 'aria-current': p === cur ? 'page' : false },
        NAV_ICONS[p] ? navIco(NAV_ICONS[p]) : null,
        el('span', null, t(k))
      )
    ),
    el(
      'button',
      { class: 'tab navmore', type: 'button', 'aria-haspopup': 'dialog', onclick: moreModal },
      navIco(NAV_ICONS.more),
      el('span', null, t('navMore'))
    )
  );
  fitNav();
}
const PHONE = matchMedia('(max-width:640px)');
const moreLinks = () =>
  [...$('#nav').querySelectorAll('a')].filter((a) =>
    PHONE.matches ? a.classList.contains('xtra') : a.classList.contains('over')
  );
function fitNav() {
  const nav = $('#nav'),
    all = [...nav.querySelectorAll('a')],
    more = nav.querySelector('.navmore');
  if (!more) return;
  all.forEach((a) => a.classList.remove('over'));
  more.classList.remove('show');
  if (!PHONE.matches && nav.clientWidth && nav.scrollWidth > nav.clientWidth + 1) {
    more.classList.add('show');
    // the extra pages go first, from the end; on a very narrow window then the main ones too, but never the open page
    const order = [
      ...all.filter((a) => a.classList.contains('xtra')).reverse(),
      ...all.filter((a) => a.classList.contains('tab') && !a.hasAttribute('aria-current')).reverse(),
    ];
    for (const a of order) {
      if (nav.scrollWidth <= nav.clientWidth + 1) break;
      a.classList.add('over');
    }
  }
  more.classList.toggle(
    'cur',
    moreLinks().some((a) => a.hasAttribute('aria-current'))
  );
}
let fitQueued = 0;
addEventListener('resize', () => {
  if (!fitQueued)
    fitQueued = requestAnimationFrame(() => {
      fitQueued = 0;
      fitNav();
    });
});
function moreModal() {
  openModal(
    el(
      'div',
      null,
      el('h1', null, t('navMore').toLocaleUpperCase(document.documentElement.lang)),
      el(
        'ul',
        { class: 'morelist' },
        moreLinks().map((a) =>
          el(
            'li',
            null,
            el(
              'a',
              {
                href: a.getAttribute('href'),
                onclick: closeModal,
                'aria-current': a.hasAttribute('aria-current') ? 'page' : false,
              },
              a.textContent
            )
          )
        )
      )
    )
  );
}
// Keep the block strips' horizontal scroll across live repaints. On phones both strips share one row (.strip2 scrolls),
// which opens at the divider so the next projected block and the latest mined block are both in view.
function stripScroll(saved) {
  const els = [$('.strip2'), ...document.querySelectorAll('.strip2 .blocks')].filter(Boolean);
  if (!saved) return els.map((e) => e.scrollLeft);
  els.forEach((e, i) => {
    e.scrollLeft = saved[i] || 0;
  });
  const s = els[0],
    g = s && s.children[1];
  if (s && g && !saved[0] && s.scrollWidth > s.clientWidth + 1)
    s.scrollLeft = g.offsetLeft - s.offsetLeft - s.clientWidth * 0.45;
  els.forEach(edges);
}
// A strip with more blocks out of view fades out at that edge, so it is clear there is more to scroll to.
function edges(e) {
  const more = e.scrollWidth > e.clientWidth + 1,
    l = more && e.scrollLeft > 1,
    r = more && e.scrollLeft + e.clientWidth < e.scrollWidth - 1;
  e.classList.toggle('more-l', l);
  e.classList.toggle('more-r', r);
}
if (typeof document !== 'undefined') {
  addEventListener(
    'scroll',
    (ev) => {
      const e = ev.target;
      if (e.classList && (e.classList.contains('strip2') || (e.classList.contains('blocks') && e.closest('.strip2'))))
        edges(e);
    },
    true
  );
  addEventListener('resize', () => stripScroll(stripScroll()));
  // A mouse wheel over a block strip scrolls it sideways (the dashboard itself does not scroll on a computer).
  addEventListener(
    'wheel',
    (ev) => {
      const e = ev.target.closest && ev.target.closest('.strip2 .blocks, .strip2');
      if (
        !e ||
        ev.deltaX ||
        !ev.deltaY ||
        e.scrollWidth <= e.clientWidth + 1 ||
        document.documentElement.scrollHeight > innerHeight + 1
      )
        return;
      e.scrollLeft += ev.deltaY;
      ev.preventDefault();
    },
    { passive: false }
  );
}
const docTitle = () => 'BLOCKHORIZON' + (Number.isFinite(st.tip) ? ' · ' + L.fmtNum(st.tip) : '');
function renderView() {
  // #/search (the app's Search shortcut) opens the dashboard with the search dialog
  if (location.hash === '#/search') {
    history.replaceState(null, '', '#/');
    queueMicrotask(searchModal);
  }
  const r = parseRoute(),
    wasMining = route === '/mining';
  route = r.path;
  routeArg = r.arg || '';
  const m = $('#main');
  const y = scrollY;
  // following another transaction on the Mining page: update in place, so the block picture keeps going
  if (wasMining && r.path === '/mining' && m.firstElementChild && m.firstElementChild.classList.contains('minegrid')) {
    morph(m.firstElementChild, viewMining(routeArg));
    mountScene();
    return;
  }
  if (wasMining && r.path !== '/mining') dropLive(); // its live list stops updating once the page is left
  document.body.classList.toggle('fit', r.path === '/');
  document.body.classList.toggle('clockmode', r.path === '/clock');
  const co = clockOpts(r.path === '/clock' ? r.arg : '');
  document.body.classList.toggle('kiosk', co.kiosk);
  document.body.classList.toggle('eink', co.eink);
  keepAwake(r.path === '/clock');
  const hadFocus = m.contains(document.activeElement) && document.activeElement !== m; // a link inside the page was used: keep keyboard focus in the new page, not lost to <body>
  const v =
    r.path === '/block'
      ? viewBlock(r.arg)
      : r.path === '/tx'
        ? viewTx(r.arg)
        : r.path === '/my'
          ? viewMy(r.arg)
          : VIEWS[r.path](routeArg);
  m.replaceChildren(v);
  if (hadFocus) m.focus({ preventScroll: true });
  if (r.path === '/') stripScroll([]);
  renderNav(r.path);
  document.title = docTitle();
  scrollTo(0, r.path === '/' ? y : 0);
  trackBlock(r.path === '/mining');
  if (r.path === '/mining') mountScene();
}
// Make the live node `a` match the freshly built node `b`, touching only what differs: unchanged text and elements stay
// in place, so hover, keyboard focus, screen readers and the strips' scroll are left alone by live updates.
function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) {
    a.replaceWith(b);
    return;
  }
  if (a.nodeType === 3) {
    if (a.data !== b.data) a.data = b.data;
    return;
  }
  if (a.nodeType !== 1) return;
  if (a.hasAttribute('data-keep') && b.hasAttribute('data-keep')) return; // drawn by its own code (the Mining page's block picture)
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  const ak = [...a.childNodes],
    bk = [...b.childNodes];
  bk.forEach((n, i) => {
    if (ak[i]) morph(ak[i], n);
    else a.append(n);
  });
  for (let i = bk.length; i < ak.length; i++) ak[i].remove();
}
// What the live view last showed: the height and the newest mined block. They can arrive in separate updates (the minute
// refresh fetches them separately), so each animates when its own data lands.
let rendering = false,
  shownTip = NaN,
  shownTop = NaN;
function render() {
  if (LIVE[route] && !rendering) {
    rendering = true;
    try {
      const cur = $('#main').firstElementChild;
      if (!cur || !cur.classList.contains(LIVE[route])) renderView();
      else {
        const top = st.blocks[0] ? st.blocks[0].height : NaN,
          moved = { height: st.tip > shownTip, blocks: top > shownTop };
        const before = moved.height || moved.blocks ? measure() : null; // a new block: remember where everything stood
        const sx = stripScroll();
        morph(cur, VIEWS[route](routeArg));
        stripScroll(sx);
        document.title = docTitle();
        arrive(before, moved);
      }
      shownTip = st.tip;
      shownTop = st.blocks[0] ? st.blocks[0].height : NaN;
    } finally {
      rendering = false;
    }
  } else if (!LIVE[route]) document.title = 'BLOCKHORIZON · ' + L.fmtNum(st.tip);
  trackBlock(route === '/mining');
  if (route === '/mining') mountScene();
  checkAlarms();
  checkFeeAlerts();
  checkTxAlerts();
  checkAddrAlerts(ownNode());
  paintFeeNow();
  paintMySince();
  paintFoot();
  const c = $('#conn'),
    fb = source === FALLBACK; // on the backup source the dot is amber and says so
  if (c) {
    c.className = 'conn ' + (fb ? 'poll' : st.conn === 'on' ? 'on' : st.conn === 'poll' ? 'poll' : '');
    c.title = fb
      ? t('srcFallback', { s: FALLBACK.replace(/^https?:\/\//, '') })
      : st.conn === 'on'
        ? t('connLive')
        : st.conn === 'poll'
          ? t('connPoll')
          : t('offline');
  }
}

// The footer, in the chosen language, naming the data host actually in use (mempool.space, your node or the backup).
function paintFoot() {
  const set = (id, v) => {
    const e = $(id);
    if (e && e.textContent !== v) e.textContent = v;
  };
  const lab = (sel, v) => {
    const e = document.querySelector(sel);
    if (e && e.getAttribute('aria-label') !== v) {
      e.setAttribute('aria-label', v);
      if (e.title) e.title = v;
    }
  };
  set('.skip', t('skipTo'));
  lab('#btn-refresh', t('refreshL'));
  lab('#btn-search', t('search'));
  lab('#btn-settings', t('settings'));
  lab('#modal-x', t('close'));
  lab('.brand', t('homeL'));
  lab('#nav', t('mainNav'));
  set('#f-priv', t('footPrivacy'));
  set('#f-sup', t('footSupport'));
  set('#f-data', t('footData', { s: srcHost() }));
}
let wake = null,
  asking = false;
// Screen Wake Lock for Clock mode: released by the browser when the page is hidden, so it is asked for again on return.
// One request at a time, and a lock that arrives after Clock mode was left is released straight away.
async function keepAwake(on) {
  try {
    if (on && !wake && !asking && !document.hidden && navigator.wakeLock) {
      asking = true;
      const w = await navigator.wakeLock.request('screen');
      asking = false;
      if (route !== '/clock') {
        await w.release();
        return;
      }
      wake = w;
      w.addEventListener('release', () => {
        if (wake === w) wake = null;
      });
    } else if (!on && wake) {
      const w = wake;
      wake = null;
      await w.release();
    }
  } catch {
    asking = false;
  }
}
// ---------- boot ----------
function tickClock() {
  const now = Date.now(),
    s = $('#since'),
    f = $('#final');
  const set = (e, v) => {
    if (e && e.textContent !== v) e.textContent = v; // unchanged text is left alone (an e-ink screen redraws on every change)
  };
  if (st.blocks[0]) set(s, clockSince(now));
  set(f, finalText(now));
  set($('#stale'), staleText(now));
  paintMining();
}
// A screen in kiosk mode runs for months: reload every 6 hours (fresh code after an update, no slow build-up).
function kioskReload() {
  setTimeout(() => (/^#\/clock\?(.*&)?kiosk\b/.test(location.hash) ? location.reload() : kioskReload()), 6 * 3600e3);
}
export async function boot() {
  kioskReload();
  hooks.render = render;
  hooks.renderView = renderView;
  // Settings changed the data server: forget the old server's saved values and start over at the new one.
  hooks.server = () => {
    newGeneration();
    resetAlarmTip();
    setServer(S.server);
    for (const k of ['tip', 'blocks', 'diff', 'fees', 'mempool', 'projected', 'hashrate', 'ln', 'pools', 'rewards'])
      store(k, null);
    Object.assign(st, {
      tip: NaN,
      blocks: [],
      diff: null,
      fees: null,
      mem: null,
      proj: null,
      hr: null,
      ln: null,
      pools: null,
      rewards: null,
    });
    reconnect();
    refreshAll();
    renderView();
  };
  hooks.alerts = () => {
    if (route === '/alarm') renderView();
    document.dispatchEvent(new Event('bh-alerts'));
  }; // price alerts changed or fired
  await loadLang(S.lang);
  applyLook();
  $('#ver').textContent = 'BLOCKHORIZON ' + VERSION;
  $('#btn-search').onclick = searchModal;
  $('#btn-settings').onclick = settingsModal;
  $('#modal-x').onclick = closeModal;
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  addEventListener('keydown', trapFocus);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#modal').hidden) closeModal();
      else if (route === '/clock') location.hash = '#/';
    }
  });
  addEventListener('hashchange', renderView);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) keepAwake(route === '/clock');
  });
  renderView();
  paintFoot();
  livePrice(onPriceTick, (src) => {
    st.priceLive = src;
    render();
  }); // the price does not depend on the data server
  initPush(await loadConfig(S.server));
  refreshAll();
  live(onLive, (s) => {
    st.conn = s;
    if (s !== 'on') dropLive();
    render();
  });
  setInterval(tickClock, 1000);
  setInterval(refreshAll, 60000);
  pullToRefresh();
  $('#btn-refresh').onclick = hardRefresh;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // A new version takes over in the background: reload once so it shows straight away.
    const had = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (had && !reloading) {
        reloading = true;
        location.reload();
      }
    });
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Installed apps are often resumed rather than reopened, so check for a new version (and fresh data) whenever the app comes back.
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            reg.update().catch(() => {});
            refreshAll();
          }
        });
      })
      .catch(() => {});
  }
}
// Reload the page; the service worker fetches app files network-first, so this also picks up a new version.
function hardRefresh() {
  toast(t('refreshing'));
  location.reload();
}
// Pull down from the top to refresh: installed apps (iPhone home screen, Android standalone) have no browser pull-to-refresh.
function pullToRefresh() {
  const ind = el('div', { id: 'ptr', class: 'ptr', 'aria-hidden': 'true' }, '↓');
  document.body.append(ind);
  const LIMIT = 80;
  let y0 = null,
    x0 = 0,
    d = 0;
  const reset = () => {
    y0 = null;
    d = 0;
    ind.style.transform = '';
    ind.style.opacity = '';
    ind.classList.remove('ready');
  };
  addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || scrollY > 0 || !$('#modal').hidden) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      d = 0;
    },
    { passive: true }
  );
  // Browsers throttle touchmove once a drag counts as a scroll, so the lift-off point in touchend decides, not the last move.
  const pull = (pt) => {
    const dy = pt.clientY - y0,
      dx = pt.clientX - x0;
    if (dy <= 0 || Math.abs(dx) > dy || scrollY > 0) {
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) reset();
      return;
    }
    d = Math.min(dy * 0.5, LIMIT * 1.4);
    ind.style.transform = `translate(-50%, ${d}px) rotate(${d * 2.5}deg)`;
    ind.style.opacity = String(Math.min(1, d / LIMIT));
    ind.textContent = d >= LIMIT ? '↻' : '↓';
    ind.classList.toggle('ready', d >= LIMIT);
  };
  addEventListener(
    'touchmove',
    (e) => {
      if (y0 !== null) pull(e.touches[0]);
    },
    { passive: true }
  );
  addEventListener('touchend', (e) => {
    if (y0 !== null && e.changedTouches[0]) pull(e.changedTouches[0]);
    if (y0 !== null && d >= LIMIT) {
      ind.textContent = '↻';
      ind.classList.add('spin');
      hardRefresh();
      return;
    }
    reset();
  });
  addEventListener('touchcancel', reset);
}
if (typeof document !== 'undefined') boot();
