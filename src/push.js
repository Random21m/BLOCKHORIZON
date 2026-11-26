// Phone notifications on a node (the container sets "push": true in config.json): the alarms set in this browser are
// sent to the node, which sends each one to the phone through ntfy when it is reached, even with no browser open
// (packaging/push.js). This browser stays the owner of its alarms: it sends its whole list whenever it changes and on
// every start. The messages are written here, in the chosen language; the node fills in the value at that moment ({now}).
import * as L from './lib.js';
import { onStore } from './api.js';
import { t } from './i18n.js';
import { S, save, hooks, alarms, feeAlerts, priceAlerts, fmtPrice, FEE_LVL_KEYS } from './state.js';

let available = false, timer = 0;
export const pushAvailable = () => available;
// A topic name nobody can guess: on ntfy.sh, anyone who knows a topic's name can read it.
export const newTopic = () => 'https://ntfy.sh/blockhorizon-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
export const okTopic = (u) => /^https?:\/\/[^\s/?#]+\/[^\s?#]+$/.test(String(u || '').trim()) && String(u).trim().length < 300;
const id = () => { if (!S.pushId) { S.pushId = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join(''); save(); } return S.pushId; };
const link = () => location.href.split('#')[0] + '#/alarm';
const seps = () => { const s = L.fmtNum(1234.5, 1); return { grp: s.length > 6 ? s[1] : '', dec: s[s.length - 2] }; };

// This browser's alarms as the node checks them, each with its message.
export function pushList() {
  const out = [];
  for (const a of alarms()) out.push({ kind: 'height', height: a.height, msg: '⏰ ' + t('reached', { h: L.fmtNum(a.height) }) + (a.label ? ': ' + a.label : '') });
  for (const a of feeAlerts()) out.push({ kind: 'fee', level: a.level, max: a.max, msg: '⏰ ' + t('feeReached', { l: t(FEE_LVL_KEYS[a.level] || 'lvlNext'), f: '{now}', m: L.fmtFee(a.max) }) });
  for (const a of priceAlerts()) out.push({ kind: 'price', cur: a.cur, price: a.price, dir: a.dir, msg: '⏰ ' + t(a.dir === 'up' ? 'priceUpTo' : 'priceDownTo', { p: fmtPrice(a.price, a.cur), n: '{now} ' + a.cur }) });
  return out;
}
// Send the list now. Resolves to how many alarms the node is watching for this browser (0 when turned off), or throws.
export async function syncPush() {
  if (!available) return 0;
  const on = S.pushOn && okTopic(S.pushUrl);
  const r = await fetch('push/sync', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ id: id(), url: on ? S.pushUrl.trim() : '', click: link(), alerts: on ? pushList() : [] }, seps())) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).watching || 0;
}
const later = () => { clearTimeout(timer); timer = setTimeout(() => syncPush().catch(() => {}), 400); };
export async function sendTest() {
  const r = await fetch('push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: S.pushUrl.trim(), msg: t('pushTestMsg'), click: link() }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
// At start, with the container's config.json: only a node with the notifier offers it.
export function initPush(cfg) {
  available = !!(cfg && cfg.push);
  if (!available) return;
  for (const k of ['alarms', 'feeAlerts', 'priceAlerts']) onStore[k] = later;
  if (S.pushOn) later();
  hooks.alerts(); // the Alarm page, if it was drawn before the config arrived, gains its panel
}
