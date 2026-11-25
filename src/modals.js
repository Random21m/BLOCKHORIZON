// Search and settings dialogs.
import * as L from './lib.js';
import { api } from './api.js';
import { CURRENCIES } from './price.js';
import { t, LANGS } from './i18n.js';
import { play, BLOCK_SOUNDS } from './sound.js';
import { hooks, $, S, save, st, el, applyLook } from './state.js';

// ---------- modals ----------
export function openModal(node) { const m = $('#modal'); $('#modal-body').replaceChildren(node); m.hidden = false; const f = m.querySelector('input,select,button:not(.x)'); (f || $('#modal-x')).focus(); }
export function closeModal() { $('#modal').hidden = true; }
export function searchModal() {
  const hi = el('input', { id: 's-h', inputmode: 'numeric', placeholder: t('eg', { x: '840000' }), 'aria-label': t('byHeight') }), di = el('input', { id: 's-d', type: 'date', 'aria-label': t('byDate') }), msg = el('div', { class: 'dim', id: 's-msg' });
  const ti = el('input', { id: 's-t', placeholder: t('txid'), 'aria-label': t('byTx'), autocomplete: 'off', spellcheck: 'false' });
  const goTx = (v) => { closeModal(); location.hash = '#/tx/' + v.trim().toLowerCase(); };
  const goH = (e) => { e.preventDefault(); if (L.isTxid(hi.value)) return goTx(hi.value); const n = L.parseHeightInput(hi.value); if (!Number.isFinite(n) || (Number.isFinite(st.tip) && n > st.tip)) { msg.textContent = t('notFound'); return; } closeModal(); location.hash = '#/block/' + n; };
  const goD = async (e) => { e.preventDefault(); if (!di.value) return; const ts = Math.floor(Date.parse(di.value + 'T00:00:00Z') / 1000); if (!Number.isFinite(ts) || ts < 1231006505) { msg.textContent = t('notFound'); return; }
    msg.textContent = '…'; try { const r = await api.byTime(ts); closeModal(); location.hash = '#/block/' + r.height; } catch { msg.textContent = t('notFound'); } };
  const goT = (e) => { e.preventDefault(); if (!L.isTxid(ti.value)) { msg.textContent = t('notTxid'); return; } goTx(ti.value); };
  openModal(el('div', null, el('h1', null, t('search').toUpperCase()), el('form', { class: 'row', onsubmit: goH }, el('label', null, t('byHeight') + ' '), hi, el('button', { class: 'btn-go', type: 'submit' }, t('go'))),
    el('form', { class: 'row', onsubmit: goD }, el('label', null, t('byDate') + ' (UTC) '), di, el('button', { class: 'btn-go', type: 'submit' }, t('go'))),
    el('form', { class: 'row', onsubmit: goT }, el('label', null, t('byTx') + ' '), ti, el('button', { class: 'btn-go', type: 'submit' }, t('go'))), msg));
}
export function settingsModal() {
  const sel = (key, opts, onchg) => el('select', { id: 'st-' + key, onchange: (e) => { S[key] = e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value; save(); applyLook(); if (onchg) onchg(); hooks.renderView(); } },
    opts.map(([v, l]) => el('option', { value: String(v), selected: String(S[key]) === String(v) }, l)));
  const chk = (key, label) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', id: 'st-' + key, checked: !!S[key], onchange: (e) => { S[key] = e.target.checked; save(); applyLook(); hooks.renderView(); } }), label);
  const row = (l, c) => el('div', { class: 'row' }, el('label', { style: 'min-width:130px' }, l), c);
  const days = (n) => t('days', { n });
  const tabs = { display: () => el('div', null, row(t('theme'), sel('theme', [['dark', t('dark')], ['light', t('light')], ['auto', t('auto')]])), row(t('currency'), sel('cur', CURRENCIES.map((c) => [c, c]))),
      row(t('satsSym'), sel('satsSym', [['sats', 'sats'], ['SATS', 'SATS'], ['sat', 'sat']])), row(t('hrAvg'), sel('hr', [['d7', days(7)], ['d14', days(14)], ['d30', days(30)], ['d90', days(90)]])),
      chk('showFees', t('showFees')), chk('feesRtl', t('feesRtl')), chk('showPool', t('showPool')), chk('showMoscow', t('showMoscow')), chk('showCap', t('showCap')),
      el('button', { onclick: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } }, t('fullscreen'))),
    format: () => el('div', null, row(t('language'), sel('lang', Object.entries(LANGS), () => { settingsModal.tab = 'format'; settingsModal(); })), row(t('timeL'), sel('h12', [[false, t('h24f')], [true, t('h12f')]])), row(t('dateL'), sel('dateFmt', [['iso', '2026-11-24'], ['dmy', '24.11.2026'], ['mdy', '11/24/2026']])), row(t('zone'), sel('utc', [[false, t('local')], [true, 'UTC']]))),
    sounds: () => el('div', null, chk('sound', t('soundNew')), row(t('blockSound'), sel('bsound', Object.entries(BLOCK_SOUNDS))), el('button', { onclick: () => play(S.bsound) }, '▶ ' + t('test')),
      chk('reduced', t('reduce'))) };
  const body = el('div'), bar2 = el('div', { class: 'tabs', role: 'tablist' });
  const show = (k) => { bar2.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k))); body.replaceChildren(tabs[k]()); };
  for (const k of Object.keys(tabs)) bar2.append(el('button', { role: 'tab', 'data-k': k, onclick: () => show(k) }, t('tab_' + k)));
  const reopen = settingsModal.tab; settingsModal.tab = null;
  openModal(el('div', null, el('h1', null, t('settings').toUpperCase()), bar2, body, el('p', { class: 'dim' }, t('storedOnly')))); show(reopen || 'display');
}
