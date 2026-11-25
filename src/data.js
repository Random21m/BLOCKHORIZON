// Data: REST refresh, live feeds (blocks, price), block alarms and notifications.
import * as L from './lib.js';
import { api, store } from './api.js';
import { t } from './i18n.js';
import { play } from './sound.js';
import { ingest } from './block-scene.js';
import { hooks, S, st, alarms, feeAlerts, priceAlerts, fmtPrice, FEE_LVL_KEYS, toast, price, priceStr } from './state.js';

// ---------- data ----------
export async function refreshAll() {
  const jobs = {
    tip: api.tip().then((v) => { const h = L.parseTipHeight(v); if (Number.isFinite(h)) st.tip = h; }),
    blocks: api.blocks().then((b) => { if (Array.isArray(b)) st.blocks = b; }),
    diff: api.difficulty().then((v) => { st.diff = v; }), fees: api.fees().then((v) => { st.fees = v; }),
    mem: api.mempool().then((v) => { st.mem = v; }), proj: api.projected().then((v) => { st.proj = v; }),
    prices: api.prices().then((v) => { st.prices = Date.now() - st.priceAt < 30000 ? Object.assign({}, v, st.prices) : v; if (v && !v.__stale) checkPriceAlerts(v); }), hr: api.hashrate().then((v) => { st.hr = v; }), ln: api.lightning().then((v) => { st.ln = v.latest || v; }),
  };
  const r = await Promise.allSettled(Object.values(jobs));
  if (r.every((x) => x.status === 'rejected')) st.conn = 'off';
  if (!Number.isFinite(st.tip) && st.blocks[0]) st.tip = st.blocks[0].height;
  hooks.render();
}
export function onNewBlock(b) {
  if (!b || !Number.isFinite(b.height)) return;
  const fresh = b.height > st.tip;
  st.blocks = [b, ...st.blocks.filter((x) => x.height !== b.height)].slice(0, 15);
  if (fresh) { st.tip = b.height; if (S.sound) play(S.bsound); api.difficulty().then((v) => { st.diff = v; hooks.render(); }).catch(() => {}); }
  hooks.render();
}
export function onLive(m) {
  if (m.block) onNewBlock(m.block);
  if (m.blocks && m.blocks.length && !st.blocks.length) { st.blocks = m.blocks.slice().sort((a, b) => b.height - a.height); st.tip = st.blocks[0].height; }
  if (m.mempoolInfo) { st.mem = Object.assign({}, st.mem, { count: m.mempoolInfo.size, vsize: m.mempoolInfo.bytes || st.mem && st.mem.vsize }); }
  if (m['mempool-blocks']) st.proj = m['mempool-blocks'];
  const pbt = m['projected-block-transactions']; if (pbt && pbt.index === 0) ingest(pbt);
  if (m.fees) st.fees = m.fees;
  if (m.vBytesPerSecond != null) st.inflow = m.vBytesPerSecond;
  hooks.render();
}
export let tickTimer;
export function paintPrice() {
  const e = document.getElementById('btc'); if (e && Number.isFinite(st.shown)) e.textContent = priceStr(st.shown);
}
export function glidePrice() { // the big price eases toward each new trade price (no flashing); reduced motion jumps straight there
  cancelAnimationFrame(st.raf);
  const step = () => {
    const target = price(); if (!Number.isFinite(target)) return;
    if (st.shownCur !== S.cur || !Number.isFinite(st.shown)) { st.shown = target; st.shownCur = S.cur; }
    const diff = target - st.shown;
    if (S.reduced || Math.abs(diff) < 0.5) { st.shown = target; paintPrice(); return; }
    st.shown += diff * 0.22; paintPrice(); st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}
export function onPriceTick(tk) {
  const prev = st.prices && st.prices[tk.cur];
  st.prices = Object.assign({}, st.prices, { [tk.cur]: tk.price }); st.priceAt = Date.now(); if (tk.pct != null) st.pct[tk.cur] = tk.pct;
  checkPriceAlerts({ [tk.cur]: tk.price });
  if (tk.cur === S.cur) { if (Number.isFinite(prev) && tk.price !== prev) st.dir = tk.price > prev ? 1 : -1; glidePrice(); }
  if (!tickTimer) tickTimer = setTimeout(() => { tickTimer = null; store('prices', st.prices); hooks.render(); }, 400);
}
// Runs on every render, so an alarm fires however the new height arrived (live feed, the minute poll, or a reopened app).
export let alarmTip = NaN;
export function checkAlarms() {
  if (!(st.tip > alarmTip) && Number.isFinite(alarmTip)) return; alarmTip = st.tip;
  const { hit, rest } = L.splitAlarms(alarms(), st.tip);
  if (!hit.length) return; store('alarms', rest);
  for (const x of hit) { const msg = '⏰ ' + t('reached', { h: L.fmtNum(x.height) }) + (x.label ? ': ' + x.label : ''); toast(msg); play(x.sound || S.asound); notify(msg); }
}
// Fee alerts: checked whenever new fee data arrives (live feed or the minute refresh). Each fires once, then is removed.
let feeSeen = null;
export function checkFeeAlerts() {
  if (!st.fees || st.fees === feeSeen) return; feeSeen = st.fees;
  const { hit, rest } = L.splitFeeAlerts(feeAlerts(), st.fees);
  if (!hit.length) return; store('feeAlerts', rest);
  for (const a of hit) { const msg = '⏰ ' + t('feeReached', { l: t(FEE_LVL_KEYS[a.level] || 'lvlNext'), f: L.fmtFee(st.fees[L.FEE_LEVELS[a.level] || 'fastestFee']), m: L.fmtFee(a.max) }); toast(msg); play(a.sound || S.asound); notify(msg); }
}
// Price alerts: checked against fresh prices only, each Kraken trade or a minute refresh that reached the network (never
// the saved prices an offline start falls back to, which can be days old). Each fires once, then is removed.
export function checkPriceAlerts(fresh) {
  const list = priceAlerts(); if (!list.length || !fresh) return;
  const { hit, rest } = L.splitPriceAlerts(list, fresh); if (!hit.length) return;
  store('priceAlerts', rest);
  for (const a of hit) { const msg = '⏰ ' + t(a.dir === 'up' ? 'priceUpTo' : 'priceDownTo', { p: fmtPrice(a.price, a.cur), n: fmtPrice(fresh[a.cur], a.cur) }); toast(msg); play(a.sound || S.asound); notify(msg); }
  hooks.alerts();
}
// A system notification as well, so an alarm is seen while the tab is in the background. Only if the user allowed it.
export function notify(body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  const o = { body, icon: 'icons/icon-192.png', tag: 'bh-alarm-' + body };
  // Android only allows notifications through the service worker; elsewhere the plain constructor works.
  const viaSw = 'serviceWorker' in navigator && navigator.serviceWorker.controller ? navigator.serviceWorker.ready.then((r) => r.showNotification('BLOCKHORIZON', o)) : Promise.reject();
  viaSw.catch(() => { try { new Notification('BLOCKHORIZON', o); } catch { /* not supported */ } });
}
export function askNotify() { try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* old Safari: callback form only */ } }
