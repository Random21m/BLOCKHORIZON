// Settings, shared live state and small helpers used everywhere.
import * as L from './lib.js';
import { store } from './api.js';
import { setLang, detectLang } from './i18n.js';

export const VERSION = '0.6.0';
export const TIP_ADDR = 'npub1vj8zjhnmkhekv93e2xmrz7kfwuxq25vrzw53u4dqhwd2lp5smvks3mwu2n@npub.cash';
export const $ = (s, r = document) => r.querySelector(s);
export const US = /^en-US/i.test((typeof navigator !== 'undefined' && navigator.language) || '');
export const DEF = { theme: 'dark', lang: detectLang(), cur: 'USD', h12: US, dateFmt: US ? 'mdy' : 'iso', utc: false, showFees: true, feesRtl: false, showPool: true, showMoscow: true, showCap: true,
  hr: 'd14', ripple: true, pulse: true, reduced: false, sound: false, bsound: 'drop', asound: 'clock', satsSym: 'sats' };
export const saved = store('settings') || {};
if (saved._v !== 2) { delete saved.h12; delete saved.dateFmt; saved._v = 2; } // older versions saved the then-default formats
export const S = Object.assign({}, DEF, saved);
export const save = () => store('settings', S);
export const st = { shown: NaN, shownCur: '', dir: 0, raf: 0, pct: {}, priceLive: false, priceAt: 0, tip: NaN, blocks: [], diff: null, fees: null, mem: null, proj: null, prices: null, hr: null, ln: null, last: 0, conn: 'off' };
export const alarms = () => store('alarms') || [];
export function tzShort(ms) { try { const p = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName'); return p ? p.value : ''; } catch { return ''; } }
export const fmtD = (ms, o) => { const opt = Object.assign({ h12: S.h12, dateFmt: S.dateFmt, utc: S.utc }, o); const base = L.fmtDate(ms, opt); return opt.dateOnly ? base : base + ' ' + (opt.utc ? 'UTC' : tzShort(ms)); };

export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
export function toast(msg) { const x = $('#toast'); x.textContent = msg; x.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { x.hidden = true; }, 3500); }
export function applyLook() {
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = S.lang; setLang(S.lang);
  document.body.classList.toggle('reduced', S.reduced); document.body.classList.toggle('nopulse', !S.pulse);
  const m = $('meta[name=theme-color]'); if (m) m.content = dark ? '#0E0D0C' : '#EAE3D2';
}
export const price = () => (st.prices && st.prices[S.cur]) || NaN;
export const NAVS = [['/', 'dash'], ['/clock', 'clock'], ['/alarm', 'alarm'], ['/calc', 'calc'], ['/replay', 'replay'], ['/events', 'events'], ['/glossary', 'glossary'], ['/watch', 'watch'], ['/about', 'about']];
export const priceStr = (v) => L.fmtNum(v, v < 100 ? 2 : 0) + ' ' + S.cur;
// Set by app.js: lets the views and the data layer repaint without importing app.js (which would be circular).
export const hooks = { render: () => {}, renderView: () => {} };
