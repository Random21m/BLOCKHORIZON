// Block alarm and calculator.
import * as L from './lib.js';
import { store } from './api.js';
import { t } from './i18n.js';
import { play, ALARM_SOUNDS } from './sound.js';
import { hooks, $, S, st, alarms, feeAlerts, priceAlerts, fmtPrice, FEE_LVL_KEYS, fmtD, el, toast, price } from './state.js';
import { CURRENCIES } from './price.js';
// Remove this entry from the saved list as it is now (not by its row number: another may have fired since the page was drawn).
const without = (list, a) => { const k = JSON.stringify(a), i = list.findIndex((x) => JSON.stringify(x) === k); if (i >= 0) list.splice(i, 1); return list; };
import { askNotify } from './data.js';

export function viewAlarm() {
  const root = el('div', { class: 'alarms' }), blk = el('section', { class: 'panel' }, el('h2', null, t('alarmTitle')), el('p', { class: 'dim' }, t('alarmIntro'))); root.append(el('h1', null, t('alarm')), blk);
  const inH = el('input', { id: 'al-h', type: 'text', inputmode: 'numeric', placeholder: t('height'), 'aria-label': t('height'), value: Number.isFinite(st.tip) ? String(st.tip + 6) : '' });
  const inB = el('input', { id: 'al-b', type: 'text', inputmode: 'numeric', placeholder: t('phFromNow'), 'aria-label': t('fromNow'), size: 10 });
  const inL = el('input', { id: 'al-l', type: 'text', placeholder: t('phLabel'), 'aria-label': t('label'), maxlength: 40 });
  const sel = el('select', { id: 'al-s', 'aria-label': t('sound') }, Object.entries(ALARM_SOUNDS).map(([k, v]) => el('option', { value: k, selected: k === S.asound }, v)));
  const out = el('div', { class: 'dim', id: 'al-out' });
  const preview = () => { const hh = inB.value ? st.tip + (parseInt(inB.value, 10) || 0) : L.parseHeightInput(inH.value); if (!Number.isFinite(hh)) { out.textContent = ''; return null; }
    const f = L.futureEstimate(hh, st.tip); out.textContent = f.past ? t('alreadyMined') : t('away', { n: L.fmtNum(f.blocks), d: fmtD(f.ms) }); return f.past ? null : hh; };
  inH.addEventListener('input', preview); inB.addEventListener('input', preview);
  blk.append(el('div', { class: 'row' }, inH, inB, inL, sel, el('button', { class: 'btn-go', onclick: () => { const hh = preview(); if (hh == null) return toast(t('notFound')); const a = alarms(); a.push({ height: hh, label: inL.value.trim(), sound: sel.value }); store('alarms', a); play(sel.value); askNotify(); hooks.renderView(); } }, t('setAlarm')), el('button', { onclick: () => play(sel.value) }, '▶ ' + t('test'))), out);
  const list = alarms(); blk.append(el('h3', { class: 'sec' }, t('active')), list.length ? el('table', null, el('tbody', null, list.map((a, i) => el('tr', null, el('td', null, L.fmtNum(a.height)), el('td', null, a.label || ''), el('td', null, t('nBlocks', { n: L.fmtNum(a.height - st.tip) })), el('td', null, el('button', { onclick: () => { store('alarms', without(alarms(), a)); hooks.renderView(); } }, t('remove'))))))) : el('p', { class: 'dim' }, t('noneYet')));
  root.append(pricePanel(), feePanel());
  preview(); return root;
}
// The "Now: x sat/vB" line under the fee alert. Called on every data update too (from app.js), so it fills in even when
// the Alarm page was drawn before the fees arrived; only this line changes, so anything typed in the form stays.
export function paintFeeNow() {
  const lvl = $('#fa-l'), now = $('#fa-now'); if (!lvl || !now) return;
  const f = st.fees ? st.fees[L.FEE_LEVELS[lvl.value]] : NaN, txt = Number.isFinite(f) ? t('feeNow', { f: L.fmtFee(f) }) : '';
  if (now.textContent !== txt) now.textContent = txt;
}
// Fee alert: a sound and a message when the chosen fee level drops to the user's limit or below.
function feePanel() {
  const cur = (lvl) => (st.fees ? st.fees[L.FEE_LEVELS[lvl]] : NaN);
  const lvl = el('select', { id: 'fa-l', 'aria-label': t('feeLevel') }, Object.keys(L.FEE_LEVELS).map((k) => el('option', { value: k }, t(FEE_LVL_KEYS[k]))));
  const max = el('input', { id: 'fa-m', type: 'text', inputmode: 'decimal', placeholder: t('feeMax'), 'aria-label': t('feeMax'), size: 12 });
  const snd = el('select', { id: 'fa-s', 'aria-label': t('sound') }, Object.entries(ALARM_SOUNDS).map(([k, v]) => el('option', { value: k, selected: k === S.asound }, v)));
  const now = el('div', { class: 'dim', id: 'fa-now' });
  lvl.addEventListener('change', paintFeeNow);
  const add = () => {
    const m = L.parseFeeLimit(max.value); if (!Number.isFinite(m)) return toast(t('feeBadLimit'));
    if (cur(lvl.value) <= m) return toast(t('feeAlready'));
    const a = feeAlerts(); a.push({ level: lvl.value, max: m, sound: snd.value }); store('feeAlerts', a); play(snd.value); askNotify(); hooks.renderView();
  };
  const list = feeAlerts(); queueMicrotask(paintFeeNow); // once the panel is on the page
  return el('section', { class: 'panel feealert' }, el('h2', null, t('feeAlert')), el('p', { class: 'dim' }, t('feeIntro')),
    el('div', { class: 'row' }, lvl, max, snd, el('button', { class: 'btn-go', id: 'fa-go', onclick: add }, t('setFee')), el('button', { onclick: () => play(snd.value) }, '▶ ' + t('test'))), now,
    el('h3', { class: 'sec' }, t('activeFee')), list.length ? el('table', { id: 'fa-list' }, el('tbody', null, list.map((a, i) => el('tr', null, el('td', null, t(FEE_LVL_KEYS[a.level] || 'lvlNext')), el('td', null, '≤ ' + L.fmtFee(a.max) + ' sat/vB'),
      el('td', null, el('button', { onclick: () => { store('feeAlerts', without(feeAlerts(), a)); hooks.renderView(); } }, t('remove'))))))) : el('p', { class: 'dim' }, t('noneYet')));
}
// Price alert: a sound and a message when BTC reaches a price (up or down from now). Also set from the trading chart.
export function addPriceAlert(cur, p, sound) {
  const now = st.prices && st.prices[cur]; if (!Number.isFinite(now)) { toast(t('priceMissing')); return false; }
  const a = priceAlerts(); a.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cur, price: p, dir: L.alertDir(p, now), sound: sound || S.asound });
  store('priceAlerts', a); askNotify(); toast(t('priceAlertSet', { p: fmtPrice(p, cur) })); hooks.alerts(); return true;
}
// Move an alert to a new price (dragged on the chart): its direction is worked out again from the price now.
export function movePriceAlert(id, p) {
  const list = priceAlerts(), a = list.find((x) => x.id === id); if (!a || !(p > 0)) return;
  const now = st.prices && st.prices[a.cur]; a.price = p; if (Number.isFinite(now)) a.dir = L.alertDir(p, now);
  store('priceAlerts', list); toast(t('priceAlertSet', { p: fmtPrice(p, a.cur) })); hooks.alerts();
}
export function removePriceAlert(id) { store('priceAlerts', priceAlerts().filter((a) => a.id !== id)); hooks.alerts(); }
function pricePanel() {
  const inP = el('input', { id: 'pa-p', type: 'text', inputmode: 'decimal', placeholder: t('priceL'), 'aria-label': t('priceL'), size: 12 });
  const cur = el('select', { id: 'pa-c', 'aria-label': t('currency') }, CURRENCIES.map((c) => el('option', { value: c, selected: c === S.cur }, c)));
  const snd = el('select', { id: 'pa-s', 'aria-label': t('sound') }, Object.entries(ALARM_SOUNDS).map(([k, v]) => el('option', { value: k, selected: k === S.asound }, v)));
  const now = el('div', { class: 'dim', id: 'pa-now' });
  const paintNow = () => { const p = st.prices && st.prices[cur.value]; now.textContent = Number.isFinite(p) ? t('priceNow', { p: fmtPrice(p, cur.value) }) : ''; };
  cur.addEventListener('change', paintNow); queueMicrotask(paintNow);
  const add = () => { const p = L.parsePriceInput(inP.value); if (!Number.isFinite(p)) return toast(t('priceBad')); if (addPriceAlert(cur.value, p, snd.value)) play(snd.value); };
  const list = priceAlerts();
  return el('section', { class: 'panel pricealert' }, el('h2', null, t('priceAlert')), el('p', { class: 'dim' }, t('priceAlertIntro')),
    el('div', { class: 'row' }, inP, cur, snd, el('button', { class: 'btn-go', id: 'pa-go', onclick: add }, t('setPrice')), el('button', { onclick: () => play(snd.value) }, '▶ ' + t('test'))), now,
    el('h3', { class: 'sec' }, t('activePrice')), list.length ? el('table', { id: 'pa-list' }, el('tbody', null, list.map((a) => el('tr', null, el('td', null, (a.dir === 'up' ? '≥ ' : '≤ ') + fmtPrice(a.price, a.cur)),
      el('td', null, el('button', { onclick: () => removePriceAlert(a.id) }, t('remove'))))))) : el('p', { class: 'dim' }, t('noneYet')));
}
export function viewCalc() {
  const root = el('div', { class: 'calc' }); root.append(el('h1', null, t('calc').toUpperCase()));
  const p = price(), res = (id) => el('div', { id, class: 'big', style: 'margin:6px 0' });
  const a = el('div', { class: 'panel' }, el('h2', null, 'Sats ⇄ ' + S.cur));
  const sats = el('input', { id: 'c-sats', inputmode: 'decimal', placeholder: 'sats', 'aria-label': 'Sats' }), fiat = el('input', { id: 'c-fiat', inputmode: 'decimal', placeholder: S.cur, 'aria-label': S.cur });
  sats.addEventListener('input', () => { const v = parseFloat(sats.value); fiat.value = Number.isFinite(v) && p ? (v / 1e8 * p).toFixed(2) : ''; });
  fiat.addEventListener('input', () => { const v = parseFloat(fiat.value); sats.value = Number.isFinite(v) && p ? Math.round(v / p * 1e8) : ''; });
  a.append(el('div', { class: 'row' }, sats, el('span', { 'aria-hidden': 'true', class: 'dim' }, '⇄'), fiat), el('div', { class: 'dim' }, p ? `1 BTC = ${L.fmtNum(p)} ${S.cur}` : t('priceMissing')));
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
      return el('tr', null, el('td', null, l, el('small', null, `${e} · ${L.fmtFee(r)} sat/vB`)), el('td', { class: 'num' }, L.fmtNum(s) + ' sats'), el('td', { class: 'num' }, Number.isFinite(p) ? L.fmtNum(s / 1e8 * p, 2) + ' ' + S.cur : '–'));
    })));
  };
  for (const x of [ins, outs, type]) { x.addEventListener('input', upd); x.addEventListener('change', upd); }
  upd();
  return el('div', { class: 'panel', id: 'pay' }, el('h2', null, t('payTitle')),
    el('div', { class: 'row' }, el('label', { for: 'p-in' }, t('inputs')), ins, el('label', { for: 'p-out' }, t('outputs')), outs, type), size, table, el('p', { class: 'dim' }, t('payNote')));
}
