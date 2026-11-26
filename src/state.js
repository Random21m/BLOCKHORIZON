// Settings, shared live state and small helpers used everywhere.
import * as L from './lib.js';
import { store } from './api.js';
import { setLang, detectLang } from './i18n.js';

export const VERSION = '0.17.0';
export const TIP_ADDR = 'npub1vj8zjhnmkhekv93e2xmrz7kfwuxq25vrzw53u4dqhwd2lp5smvks3mwu2n@npub.cash';
export const $ = (s, r = document) => r.querySelector(s);
export const US = /^en-US/i.test((typeof navigator !== 'undefined' && navigator.language) || '');
export const DEF = {
  theme: 'dark',
  lang: detectLang(),
  cur: 'USD',
  h12: US,
  dateFmt: US ? 'mdy' : 'iso',
  utc: false,
  feesRtl: false,
  showPool: true,
  showMoscow: true,
  showCap: true,
  hr: 'd14',
  ripple: true,
  pulse: true,
  reduced: false,
  sound: false,
  bsound: 'drop',
  asound: 'clock',
  satsSym: 'sats',
  server: '',
  tileOrder: null,
  tileOff: null,
  pushOn: false,
  pushUrl: '',
  pushId: '',
};
export const saved = store('settings') || {};
if (saved._v !== 2) {
  delete saved.h12;
  delete saved.dateFmt;
  saved._v = 2;
} // older versions saved the then-default formats
if (saved.showFees === false && !saved.tileOff) saved.tileOff = ['fees', 'mem', 'proj']; // the old 'Show fees and mempool' switch, now part of the tile list
delete saved.showFees;
export const S = Object.assign({}, DEF, saved);
export const save = () => store('settings', S);
export const st = {
  shown: NaN,
  shownCur: '',
  dir: 0,
  raf: 0,
  pct: {},
  priceLive: false,
  priceAt: 0,
  tip: NaN,
  blocks: [],
  diff: null,
  fees: null,
  mem: null,
  proj: null,
  prices: null,
  hr: null,
  ln: null,
  last: 0,
  conn: 'off',
};
export const alarms = () => store('alarms') || [];
export const feeAlerts = () => store('feeAlerts') || [];
export const priceAlerts = () => store('priceAlerts') || [];
// Transactions to report once confirmed: [{ txid }] (set on a waiting transaction's page).
export const txAlerts = () => store('txAlerts') || [];
export const fmtPrice = (v, cur) => L.fmtNum(v, L.priceDigits(v)) + ' ' + cur;
export const FEE_LVL_KEYS = { next: 'lvlNext', h30: 'lvl30', h1: 'lvl60' }; // translation keys for the fee alert speeds
export function tzShort(ms) {
  try {
    const p = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date(ms))
      .find((x) => x.type === 'timeZoneName');
    return p ? p.value : '';
  } catch {
    return '';
  }
}
export const fmtD = (ms, o) => {
  const opt = Object.assign({ h12: S.h12, dateFmt: S.dateFmt, utc: S.utc }, o);
  const base = L.fmtDate(ms, opt);
  return opt.dateOnly ? base : base + ' ' + (opt.utc ? 'UTC' : tzShort(ms));
};

export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
export function toast(msg) {
  const x = $('#toast');
  x.textContent = msg;
  x.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    x.hidden = true;
  }, 3500);
}
export function applyLook() {
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = S.lang;
  setLang(S.lang);
  document.body.classList.toggle('reduced', S.reduced);
  document.body.classList.toggle('nopulse', !S.pulse);
  const m = $('meta[name=theme-color]');
  if (m) m.content = dark ? '#0E0D0C' : '#EAE3D2';
}
// The dashboard tiles people can hide and reorder (Settings, Dashboard), with the key of each one's name. The block height
// is always shown first; the block strips stay along the bottom (they can be hidden, not moved).
export const TILES = [
  ['halving', 'halving'],
  ['diff', 'difficulty'],
  ['hash', 'hashrate'],
  ['supply', 'supply'],
  ['last', 'last'],
  ['prod', 'production'],
  ['fees', 'fees'],
  ['mem', 'mempool'],
  ['price', 'price'],
  ['ln', 'lightning'],
];
export const STRIPS = [
  ['proj', 'projected'],
  ['rec', 'recent'],
];
// The tiles in the chosen order (any tile added in a later version goes at the end), each with whether it is shown.
export function dashTiles() {
  const ids = TILES.map((x) => x[0]),
    order = (S.tileOrder || []).filter((id) => ids.includes(id));
  const off = S.tileOff || [];
  return [...order, ...ids.filter((id) => !order.includes(id))].map((id) => ({ id, on: !off.includes(id) }));
}
export const tileOn = (id) => !(S.tileOff || []).includes(id);
export const price = () => (st.prices && st.prices[S.cur]) || NaN;
export const NAVS = [
  ['/', 'dash'],
  ['/clock', 'clock'],
  ['/mining', 'mining'],
  ['/alarm', 'alarm'],
  ['/calc', 'calc'],
  ['/charts', 'charts'],
  ['/my', 'myBlock'],
  ['/replay', 'replay'],
  ['/events', 'events'],
  ['/glossary', 'glossary'],
  ['/watch', 'watch'],
  ['/about', 'about'],
];
// On phones the menu becomes a bar along the bottom: these pages get a tab, the rest are behind 'More'.
export const PHONE_TABS = ['/', '/mining', '/charts', '/alarm'];
export const NAV_ICONS = {
  '/': 'M3 17h18M7 17a5 5 0 0 1 10 0M12 4v3M5.6 8.6l2 2M18.4 8.6l-2 2',
  '/mining': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  '/charts': 'M4 19V5M4 19h16M8 15l4-5 3 3 5-7',
  '/alarm': 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M5 3 2 6M19 3l3 3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};
export const priceStr = (v) => L.fmtNum(v, v < 100 ? 2 : 0) + ' ' + S.cur;
// Set by app.js: lets the views and the data layer repaint without importing app.js (which would be circular).
export const hooks = { render: () => {}, renderView: () => {}, alerts: () => {}, server: () => {} }; // alerts: the trading chart redraws its alert lines
