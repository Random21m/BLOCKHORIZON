// Search and settings dialogs.
import * as L from './lib.js';
import { api, normServer, DEFAULT_SERVER, FALLBACK, getServer } from './api.js';
import { CURRENCIES } from './price.js';
import { t, LANGS, loadLang } from './i18n.js';
import { play, BLOCK_SOUNDS } from './sound.js';
import { hooks, $, S, save, st, el, applyLook, dashTiles, tileOn, TILES, STRIPS } from './state.js';

// ---------- modals ----------
// Dialogs are named by their heading, keep keyboard focus inside while open, and hand it back to where it was on close.
let opener = null;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
export function openModal(node) {
  const m = $('#modal'); if (m.hidden) opener = document.activeElement;
  $('#modal-body').replaceChildren(node); m.hidden = false;
  const h = node.querySelector('h1'); if (h) { h.id = 'modal-title'; m.setAttribute('aria-labelledby', 'modal-title'); }
  const f = m.querySelector('input,select,button:not(.x)'); (f || $('#modal-x')).focus();
}
export function closeModal() { const m = $('#modal'); if (m.hidden) return; m.hidden = true; if (opener && document.contains(opener)) opener.focus(); opener = null; }
export function trapFocus(e) { // Tab and Shift+Tab wrap around inside the open dialog
  const m = $('#modal'); if (e.key !== 'Tab' || m.hidden) return;
  const f = [...m.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null); if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || !m.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !m.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
}
export function searchModal() {
  const hi = el('input', { id: 's-h', inputmode: 'numeric', placeholder: t('eg', { x: '840000' }), 'aria-label': t('byHeight') }), di = el('input', { id: 's-d', type: 'date', 'aria-label': t('byDate') }), msg = el('div', { class: 'dim', id: 's-msg' });
  const ti = el('input', { id: 's-t', placeholder: t('txid'), 'aria-label': t('byTx'), autocomplete: 'off', spellcheck: 'false' });
  const goTx = (v) => { closeModal(); location.hash = '#/tx/' + v.trim().toLowerCase(); };
  const goH = (e) => { e.preventDefault(); if (L.isTxid(hi.value)) return goTx(hi.value); const n = L.parseHeightInput(hi.value); if (!Number.isFinite(n) || (Number.isFinite(st.tip) && n > st.tip)) { msg.textContent = t('notFound'); return; } closeModal(); location.hash = '#/block/' + n; };
  const goD = async (e) => { e.preventDefault(); if (!di.value) return; const ts = Math.floor(Date.parse(di.value + 'T00:00:00Z') / 1000); if (!Number.isFinite(ts) || ts < 1231006505) { msg.textContent = t('notFound'); return; }
    msg.textContent = '…'; try { const r = await api.byTime(ts); closeModal(); location.hash = '#/block/' + r.height; } catch { msg.textContent = t('notFound'); } };
  const goT = (e) => { e.preventDefault(); if (!L.isTxid(ti.value)) { msg.textContent = t('notTxid'); return; } goTx(ti.value); };
  openModal(el('div', null, el('h1', null, t('search').toLocaleUpperCase(document.documentElement.lang)), el('form', { class: 'row', onsubmit: goH }, el('label', null, t('byHeight') + ' '), hi, el('button', { class: 'btn-go', type: 'submit' }, t('go'))),
    el('form', { class: 'row', onsubmit: goD }, el('label', null, t('byDate') + ' (UTC) '), di, el('button', { class: 'btn-go', type: 'submit' }, t('go'))),
    el('form', { class: 'row', onsubmit: goT }, el('label', null, t('byTx') + ' '), ti, el('button', { class: 'btn-go', type: 'submit' }, t('go'))), msg));
}
export function settingsModal() {
  const sel = (key, opts, onchg) => el('select', { id: 'st-' + key, onchange: async (e) => { const v = e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value;
    S[key] = v; save(); if (key === 'lang') await loadLang(v); // a language is downloaded the first time it is chosen
    applyLook(); if (onchg) onchg(); hooks.renderView(); } },
    opts.map(([v, l]) => el('option', { value: String(v), selected: String(S[key]) === String(v) }, l)));
  const chk = (key, label) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'st-' + key, checked: !!S[key], onchange: (e) => { S[key] = e.target.checked; save(); applyLook(); hooks.renderView(); } }), label);
  const row = (l, c) => el('div', { class: 'row' }, el('label', { for: c.id, style: 'min-width:130px' }, l), c);
  const days = (n) => t('days', { n });
  const tabs = { display: () => el('div', null, row(t('theme'), sel('theme', [['dark', t('dark')], ['light', t('light')], ['auto', t('auto')]])), row(t('currency'), sel('cur', CURRENCIES.map((c) => [c, c]))),
      row(t('satsSym'), sel('satsSym', [['sats', 'sats'], ['SATS', 'SATS'], ['sat', 'sat']])), row(t('hrAvg'), sel('hr', [['d7', days(7)], ['d14', days(14)], ['d30', days(30)], ['d90', days(90)]])),
      chk('feesRtl', t('feesRtl')), chk('showPool', t('showPool')), chk('showMoscow', t('showMoscow')), chk('showCap', t('showCap')),
      el('button', { onclick: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } }, t('fullscreen'))),
    // Dashboard: which tiles are shown and in what order (the block height always comes first)
    tiles: () => {
      const list = dashTiles(), put = () => { S.tileOrder = list.map((x) => x.id); S.tileOff = [...list.filter((x) => !x.on).map((x) => x.id), ...STRIPS.map((x) => x[0]).filter((id) => !tileOn(id))]; save(); hooks.renderView(); };
      const name = (id) => t(TILES.find((x) => x[0] === id)[1]);
      const redraw = (focus) => { settingsModal.tab = 'tiles'; settingsModal(); if (focus) { const b = $(focus); if (b && !b.disabled) b.focus(); else { const c = $('#tl-' + focus.split('-')[2]); if (c) c.focus(); } } };
      const move = (i, d) => { const [x] = list.splice(i, 1); list.splice(i + d, 0, x); put(); redraw(`#tl-${d < 0 ? 'up' : 'dn'}-${x.id}`); };
      return el('div', null, el('p', { class: 'dim' }, t('tilesIntro')),
        el('ul', { class: 'tilelist' }, list.map((x, i) => el('li', null,
          el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'tl-' + x.id, checked: x.on, onchange: (e) => { x.on = e.target.checked; put(); } }), name(x.id)),
          el('button', { id: 'tl-up-' + x.id, class: 'mv', 'aria-label': t('moveUp', { t: name(x.id) }), title: t('moveUp', { t: name(x.id) }), disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
          el('button', { id: 'tl-dn-' + x.id, class: 'mv', 'aria-label': t('moveDown', { t: name(x.id) }), title: t('moveDown', { t: name(x.id) }), disabled: i === list.length - 1, onclick: () => move(i, 1) }, '↓')))),
        STRIPS.map(([id, k]) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'tl-' + id, checked: tileOn(id), onchange: (e) => {
          const off = (S.tileOff || []).filter((y) => y !== id); if (!e.target.checked) off.push(id); S.tileOff = off; save(); hooks.renderView(); } }), t(k))),
        el('button', { onclick: () => { S.tileOrder = null; S.tileOff = null; save(); hooks.renderView(); redraw(); } }, t('tilesReset')));
    },
    format: () => el('div', null, row(t('language'), sel('lang', Object.entries(LANGS), () => { if ($('#modal').hidden) return; settingsModal.tab = 'format'; settingsModal(); })), row(t('timeL'), sel('h12', [[false, t('h24f')], [true, t('h12f')]])), row(t('dateL'), sel('dateFmt', [['iso', '2026-11-24'], ['dmy', '24.11.2026'], ['mdy', '11/24/2026']])), row(t('zone'), sel('utc', [[false, t('local')], [true, 'UTC']]))),
    sounds: () => el('div', null, chk('sound', t('soundNew')), row(t('blockSound'), sel('bsound', Object.entries(BLOCK_SOUNDS).map(([k, v]) => [k, t(v)]))), el('button', { onclick: () => play(S.bsound) }, '▶ ' + t('test')),
      chk('reduced', t('reduce'))),
    // Data server: mempool.space, or any mempool-compatible server such as your own node. Checked before it is used.
    data: () => { const inp = el('input', { id: 'st-server', type: 'url', inputmode: 'url', placeholder: DEFAULT_SERVER, value: S.server || '', autocomplete: 'off', spellcheck: 'false' }), msg = el('p', { class: 'dim', role: 'status' }, t('srvNow', { s: getServer().replace(/^https?:\/\//, '') }));
      const use = async (v) => {
        const n = v.trim() ? normServer(v) : ''; if (v.trim() && !n) { msg.textContent = t('srvBad'); return; }
        if (n && location.protocol === 'https:' && n.startsWith('http:')) { msg.textContent = t('srvHttps'); return; } // browsers block it (mixed content)
        if (n) { msg.textContent = '…'; try { const r = await fetch(n + '/api/blocks/tip/height', { cache: 'no-store' }); if (!r.ok || !(parseInt(await r.text(), 10) > 0)) throw new Error('bad'); } catch { msg.textContent = t('srvFail', { s: n }); return; } }
        S.server = n; save(); hooks.server(); msg.textContent = t('srvOk', { s: (n || DEFAULT_SERVER).replace(/^https?:\/\//, '') });
      };
      return el('div', null, el('p', { class: 'dim' }, t('srvIntro')), row(t('srvL'), inp),
        el('div', { class: 'row' }, el('button', { class: 'btn-go', onclick: () => use(inp.value) }, t('srvUse')), el('button', { onclick: () => { inp.value = ''; use(''); } }, t('srvReset'))), msg,
        el('p', { class: 'dim' }, t('srvNote', { f: FALLBACK.replace(/^https?:\/\//, '') }))); } };
  const body = el('div', { id: 'st-panel', role: 'tabpanel' }), bar2 = el('div', { class: 'tabs', role: 'tablist', 'aria-label': t('settings') });
  const show = (k) => { bar2.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.k === k)); b.tabIndex = b.dataset.k === k ? 0 : -1; }); body.setAttribute('aria-labelledby', 'tab-' + k); body.replaceChildren(tabs[k]()); };
  const keys = Object.keys(tabs);
  for (const k of keys) bar2.append(el('button', { role: 'tab', id: 'tab-' + k, 'data-k': k, 'aria-controls': 'st-panel', onclick: () => show(k),
    onkeydown: (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return; e.preventDefault(); const n = keys[(keys.indexOf(k) + d + keys.length) % keys.length]; show(n); $('#tab-' + n).focus(); } }, t('tab_' + k)));
  const reopen = settingsModal.tab; settingsModal.tab = null;
  openModal(el('div', null, el('h1', null, t('settings').toLocaleUpperCase(document.documentElement.lang)), bar2, body, el('p', { class: 'dim' }, t('storedOnly')))); show(reopen || 'display');
}
