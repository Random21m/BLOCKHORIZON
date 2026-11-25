// Block alarm and calculator.
import * as L from './lib.js';
import { store } from './api.js';
import { t } from './i18n.js';
import { play, ALARM_SOUNDS } from './sound.js';
import { hooks, $, S, st, alarms, feeAlerts, FEE_LVL_KEYS, fmtD, el, toast, price } from './state.js';
import { askNotify } from './data.js';

export function viewAlarm() {
  const root = el('div'); root.append(el('h1', null, t('alarmTitle')), el('p', { class: 'dim' }, t('alarmIntro')));
  const inH = el('input', { id: 'al-h', type: 'text', inputmode: 'numeric', placeholder: t('height'), 'aria-label': t('height'), value: Number.isFinite(st.tip) ? String(st.tip + 6) : '' });
  const inB = el('input', { id: 'al-b', type: 'text', inputmode: 'numeric', placeholder: t('phFromNow'), 'aria-label': t('fromNow'), size: 10 });
  const inL = el('input', { id: 'al-l', type: 'text', placeholder: t('phLabel'), 'aria-label': t('label'), maxlength: 40 });
  const sel = el('select', { id: 'al-s', 'aria-label': t('sound') }, Object.entries(ALARM_SOUNDS).map(([k, v]) => el('option', { value: k, selected: k === S.asound }, v)));
  const out = el('div', { class: 'dim', id: 'al-out' });
  const preview = () => { const hh = inB.value ? st.tip + (parseInt(inB.value, 10) || 0) : L.parseHeightInput(inH.value); if (!Number.isFinite(hh)) { out.textContent = ''; return null; }
    const f = L.futureEstimate(hh, st.tip); out.textContent = f.past ? t('alreadyMined') : t('away', { n: L.fmtNum(f.blocks), d: fmtD(f.ms) }); return f.past ? null : hh; };
  inH.addEventListener('input', preview); inB.addEventListener('input', preview);
  root.append(el('div', { class: 'row' }, inH, inB, inL, sel, el('button', { class: 'btn-go', onclick: () => { const hh = preview(); if (hh == null) return toast(t('notFound')); const a = alarms(); a.push({ height: hh, label: inL.value.trim(), sound: sel.value }); store('alarms', a); play(sel.value); askNotify(); hooks.renderView(); } }, t('setAlarm')), el('button', { onclick: () => play(sel.value) }, '▶ ' + t('test'))), out);
  const list = alarms(); root.append(el('h2', { class: 'dim mono' }, t('active')), list.length ? el('table', null, el('tbody', null, list.map((a, i) => el('tr', null, el('td', null, L.fmtNum(a.height)), el('td', null, a.label || ''), el('td', null, t('nBlocks', { n: L.fmtNum(a.height - st.tip) })), el('td', null, el('button', { onclick: () => { const x = alarms(); x.splice(i, 1); store('alarms', x); hooks.renderView(); } }, t('remove'))))))) : el('p', { class: 'dim' }, t('noneYet')));
  root.append(feePanel());
  preview(); return root;
}
// Fee alert: a sound and a message when the chosen fee level drops to the user's limit or below.
function feePanel() {
  const cur = (lvl) => (st.fees ? st.fees[L.FEE_LEVELS[lvl]] : NaN);
  const lvl = el('select', { id: 'fa-l', 'aria-label': t('feeLevel') }, Object.keys(L.FEE_LEVELS).map((k) => el('option', { value: k }, t(FEE_LVL_KEYS[k]))));
  const max = el('input', { id: 'fa-m', type: 'text', inputmode: 'decimal', placeholder: t('feeMax'), 'aria-label': t('feeMax'), size: 12 });
  const snd = el('select', { id: 'fa-s', 'aria-label': t('sound') }, Object.entries(ALARM_SOUNDS).map(([k, v]) => el('option', { value: k, selected: k === S.asound }, v)));
  const now = el('div', { class: 'dim', id: 'fa-now' });
  const showNow = () => { const f = cur(lvl.value); now.textContent = Number.isFinite(f) ? t('feeNow', { f: L.fmtFee(f) }) : ''; };
  lvl.addEventListener('change', showNow);
  const add = () => {
    const m = L.parseFeeLimit(max.value); if (!Number.isFinite(m)) return toast(t('feeBadLimit'));
    if (cur(lvl.value) <= m) return toast(t('feeAlready'));
    const a = feeAlerts(); a.push({ level: lvl.value, max: m, sound: snd.value }); store('feeAlerts', a); play(snd.value); askNotify(); hooks.renderView();
  };
  const list = feeAlerts(); showNow();
  return el('section', { class: 'feealert' }, el('h2', { class: 'dim mono', style: 'margin-top:28px' }, t('feeAlert')), el('p', { class: 'dim' }, t('feeIntro')),
    el('div', { class: 'row' }, lvl, max, snd, el('button', { class: 'btn-go', id: 'fa-go', onclick: add }, t('setFee')), el('button', { onclick: () => play(snd.value) }, '▶ ' + t('test'))), now,
    el('h2', { class: 'dim mono' }, t('activeFee')), list.length ? el('table', { id: 'fa-list' }, el('tbody', null, list.map((a, i) => el('tr', null, el('td', null, t(FEE_LVL_KEYS[a.level] || 'lvlNext')), el('td', null, '≤ ' + L.fmtFee(a.max) + ' sat/vB'),
      el('td', null, el('button', { onclick: () => { const x = feeAlerts(); x.splice(i, 1); store('feeAlerts', x); hooks.renderView(); } }, t('remove'))))))) : el('p', { class: 'dim' }, t('noneYet')));
}
export function viewCalc() {
  const root = el('div'); root.append(el('h1', null, t('calc').toUpperCase()));
  const p = price(), res = (id) => el('div', { id, class: 'big', style: 'margin:6px 0' });
  const a = el('div', { class: 'panel' }, el('h2', null, 'Sats ⇄ ' + S.cur));
  const sats = el('input', { id: 'c-sats', inputmode: 'decimal', placeholder: 'sats', 'aria-label': 'Sats' }), fiat = el('input', { id: 'c-fiat', inputmode: 'decimal', placeholder: S.cur, 'aria-label': S.cur });
  sats.addEventListener('input', () => { const v = parseFloat(sats.value); fiat.value = Number.isFinite(v) && p ? (v / 1e8 * p).toFixed(2) : ''; });
  fiat.addEventListener('input', () => { const v = parseFloat(fiat.value); sats.value = Number.isFinite(v) && p ? Math.round(v / p * 1e8) : ''; });
  a.append(el('div', { class: 'row' }, sats, el('span', null, '⇄'), fiat), el('div', { class: 'dim' }, p ? `1 BTC = ${L.fmtNum(p)} ${S.cur}` : t('priceMissing')));
  const b = el('div', { class: 'panel' }, el('h2', null, t('heightDate')));
  const bh = el('input', { id: 'c-h', inputmode: 'numeric', placeholder: t('height'), 'aria-label': t('height') }), out = res('c-out');
  bh.addEventListener('input', () => { const n = L.parseHeightInput(bh.value); if (!Number.isFinite(n)) { out.textContent = ''; return; } const f = L.futureEstimate(n, st.tip); const sp = L.supplyAt(n);
    out.textContent = t(f.past ? 'minedAbout' : 'estimated', { d: fmtD(f.ms) }); out.title = ''; $('#c-sup').textContent = t('supplyAt', { s: L.satsToBtc(sp, 4), r: L.satsToBtc(L.subsidy(n), 4) }); });
  b.append(el('div', { class: 'row' }, bh), out, el('div', { class: 'dim', id: 'c-sup' }), el('p', { class: 'dim' }, t('calcNote')));
  root.append(el('div', { class: 'grid' }, a, b, payPanel(p))); return root;
}
// What a payment costs now: typical size for the inputs, outputs and address type, at each of the current fee levels.
export function payPanel(p) {
  const num = (id, v, label) => el('input', { id, inputmode: 'numeric', value: v, size: 3, 'aria-label': label });
  const ins = num('p-in', '1', t('inputs')), outs = num('p-out', '2', t('outputs'));
  const type = el('select', { id: 'p-type', 'aria-label': t('addrType') }, [['segwit', t('segwit')], ['taproot', t('taproot')], ['legacy', t('legacy')]].map(([v, l]) => el('option', { value: v }, l)));
  const size = el('div', { class: 'dim', id: 'p-size' }), table = el('table', { id: 'p-table', class: 'paytable' });
  const upd = () => {
    const vb = L.txVsize(parseInt(ins.value, 10), parseInt(outs.value, 10), type.value), f = st.fees; size.textContent = t('paySize', { n: vb });
    if (!f) { table.replaceChildren(el('tbody', null, el('tr', null, el('td', null, t('feesMissing'))))); return; }
    table.replaceChildren(el('tbody', null, [[t('feeNext'), t('eta10'), f.fastestFee], [t('fee30'), t('eta30'), f.halfHourFee], [t('fee1h'), t('eta60'), f.hourFee], [t('feeSlow'), t('etaLater'), f.economyFee]].map(([l, e, r]) => {
      const s = Math.ceil(r * vb);
      return el('tr', null, el('td', null, `${l} (${e})`), el('td', { class: 'num rate' }, L.fmtFee(r) + ' sat/vB'), el('td', { class: 'num' }, L.fmtNum(s) + ' sats'), el('td', { class: 'num' }, Number.isFinite(p) ? L.fmtNum(s / 1e8 * p, 2) + ' ' + S.cur : '–'));
    })));
  };
  for (const x of [ins, outs, type]) { x.addEventListener('input', upd); x.addEventListener('change', upd); }
  upd();
  return el('div', { class: 'panel', id: 'pay' }, el('h2', null, t('payTitle')),
    el('div', { class: 'row' }, el('label', { for: 'p-in' }, t('inputs')), ins, el('label', { for: 'p-out' }, t('outputs')), outs, type), size, table, el('p', { class: 'dim' }, t('payNote')));
}
