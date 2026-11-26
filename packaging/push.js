// Phone notifications for alarms, on a node (the container with MEMPOOL_URL set). Runs inside nginx (njs), so the image
// needs no other program. Each browser that turns notifications on sends its alarms here (PUT /push/sync); once a
// minute check() reads the node's mempool through this container's own /api proxy and, for every alarm that is reached,
// sends the browser's own message (already in its language) to the ntfy topic it chose. A sent alarm is removed.
//
// The browser stays the owner of its alarms: it sends the whole list again whenever it changes and on every start, so a
// restart without a data volume loses nothing that matters. Alarms already reached when they arrive are not sent: the
// open browser shows those itself. An alarm sent once is not sent again for 30 days, even if a browser sends it back.
//
// Written for njs 0.8 (no destructuring, no spread, no `await` inside a call's arguments, no for...of).
import fs from 'fs';

// BH_DATA and BH_API are for tests/push.mjs (they need an `env` line in nginx.conf); the container uses the defaults.
const ENV = typeof process !== 'undefined' && process.env ? process.env : {};
const FILE = (ENV.BH_DATA || '/var/lib/blockhorizon') + '/push.json', API = ENV.BH_API || 'http://127.0.0.1/api';
const KEEP_SENT = 30 * 864e5, FIELDS = { next: 'fastestFee', h30: 'halfHourFee', h1: 'hourFee' };

function load() {
  try { const d = JSON.parse(fs.readFileSync(FILE)); if (d && typeof d === 'object' && d.clients) return d; } catch (e) { /* none yet */ }
  return { clients: {}, sent: {}, last: {} };
}
function save(d) { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, FILE); }

const okUrl = (u) => typeof u === 'string' && u.length < 300 && /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(u);
const str = (s, n) => String(s == null ? '' : s).slice(0, n);

// One alarm as the browser sends it -> the few fields the check needs (anything else is dropped).
function clean(a) {
  if (!a || typeof a !== 'object') return null;
  const msg = str(a.msg, 300); if (!msg) return null;
  if (a.kind === 'height' && a.height > 0) return { kind: 'height', height: Math.floor(a.height), msg: msg };
  if (a.kind === 'fee' && FIELDS[a.level] && a.max > 0) return { kind: 'fee', level: a.level, max: +a.max, msg: msg };
  if (a.kind === 'price' && /^[A-Z]{3}$/.test(a.cur) && a.price > 0 && (a.dir === 'up' || a.dir === 'down')) return { kind: 'price', cur: a.cur, price: +a.price, dir: a.dir, msg: msg };
  return null;
}
const keyOf = (a) => [a.kind, a.height, a.level, a.max, a.cur, a.price, a.dir].join('|');

// The value an alarm watches, from the latest data: its height, fee level or price ({now} in its message).
function valueFor(a, last) {
  if (a.kind === 'height') return last.tip;
  if (a.kind === 'fee') return last.fees ? last.fees[FIELDS[a.level]] : undefined;
  return last.prices ? last.prices[a.cur] : undefined;
}
function reached(a, last) {
  const v = valueFor(a, last); if (typeof v !== 'number' || !isFinite(v)) return false;
  if (a.kind === 'height') return v >= a.height;
  if (a.kind === 'fee') return v <= a.max;
  return a.dir === 'up' ? v >= a.price : v <= a.price;
}

// The value for {now}, written the way the app writes it, with the browser's own number separators.
function fmtNow(a, v, c) {
  const d = a.kind === 'fee' ? (v < 10 ? 1 : 0) : a.kind === 'price' ? (v >= 1e5 ? 0 : v >= 100 ? 1 : 2) : 0;
  const p = v.toFixed(d).split('.'), grp = typeof c.grp === 'string' ? c.grp : ',', dec = typeof c.dec === 'string' ? c.dec : '.';
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, grp) + (p[1] ? dec + p[1] : '');
}
async function getJSON(path) { const r = await ngx.fetch(API + path, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }
// Only what the waiting alarms need.
async function fetchLast(alerts) {
  const last = { at: Date.now() }, need = {};
  alerts.forEach((a) => { need[a.kind] = true; });
  if (need.height) { const r = await ngx.fetch(API + '/blocks/tip/height'); if (r.ok) { const txt = await r.text(); last.tip = parseInt(txt, 10); } }
  if (need.fee) last.fees = await getJSON('/v1/fees/recommended');
  if (need.price) last.prices = await getJSON('/v1/prices');
  return last;
}

async function send(url, msg, click) {
  const h = { Title: 'BLOCKHORIZON', Tags: 'alarm_clock', 'Content-Type': 'text/plain; charset=utf-8' };
  if (click) h.Click = click;
  const r = await ngx.fetch(url, { method: 'POST', headers: h, body: msg });
  if (!r.ok) throw new Error('ntfy ' + r.status);
}

function allAlerts(d) { const out = []; Object.keys(d.clients).forEach((id) => { (d.clients[id].alerts || []).forEach((a) => out.push(a)); }); return out; }

// Once a minute (js_periodic). Does nothing, not even a request to the node, while no alarm is waiting.
async function check() {
  let d = load(); const all = allAlerts(d); if (!all.length) return;
  let last; try { last = await fetchLast(all); } catch (e) { ngx.log(ngx.WARN, 'blockhorizon push: ' + e.message); return; }
  const done = [];
  const ids = Object.keys(d.clients);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i], c = d.clients[id], list = c.alerts || [];
    for (let j = 0; j < list.length; j++) {
      const a = list[j]; if (!reached(a, last)) continue;
      const now = fmtNow(a, valueFor(a, last), c);
      try { await send(c.url, a.msg.replace(/\{now\}/g, now), c.click); done.push(id + ' ' + keyOf(a)); } catch (e) { ngx.log(ngx.WARN, 'blockhorizon push: ' + e.message); }
    }
  }
  // read again before writing: a browser may have sent a new list while this check was waiting on the network
  d = load(); const t = Date.now();
  Object.keys(d.clients).forEach((id) => { const c = d.clients[id]; c.alerts = (c.alerts || []).filter((a) => done.indexOf(id + ' ' + keyOf(a)) < 0); });
  done.forEach((k) => { d.sent[k] = t; });
  Object.keys(d.sent).forEach((k) => { if (t - d.sent[k] > KEEP_SENT) delete d.sent[k]; });
  d.last = last; save(d);
}

function reply(r, code, obj) { r.headersOut['Content-Type'] = 'application/json'; r.headersOut['Cache-Control'] = 'no-store'; r.return(code, JSON.stringify(obj)); }
function body(r) { try { return JSON.parse(r.requestText || ''); } catch (e) { return null; } }

// PUT /push/sync { id, url, click, alerts }: this browser's alarms (an empty url turns it off for this browser).
async function sync(r) {
  if (r.method !== 'PUT') return reply(r, 405, { error: 'method' });
  const b = body(r); if (!b || typeof b.id !== 'string' || !/^[a-z0-9]{8,40}$/.test(b.id)) return reply(r, 400, { error: 'id' });
  const d = load();
  if (!b.url) { delete d.clients[b.id]; save(d); return reply(r, 200, { ok: true, watching: 0 }); }
  if (!okUrl(b.url)) return reply(r, 400, { error: 'url' });
  let list = (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 200).map(clean).filter(Boolean);
  // what the node knows now, so an alarm the open browser is about to show itself is not also sent to the phone
  let last = d.last; if (!last || !last.at || Date.now() - last.at > 120000) { try { last = await fetchLast(list); } catch (e) { last = {}; } }
  list = list.filter((a) => !d.sent[b.id + ' ' + keyOf(a)] && !reached(a, last));
  d.clients[b.id] = { url: b.url, click: okUrl(b.click) ? b.click : '', grp: str(b.grp, 2), dec: str(b.dec, 1) || '.', alerts: list, at: Date.now() };
  save(d); reply(r, 200, { ok: true, watching: list.length });
}

// POST /push/test { url, msg }: send one message now, so the phone can be checked.
async function test(r) {
  if (r.method !== 'POST') return reply(r, 405, { error: 'method' });
  const b = body(r); if (!b || !okUrl(b.url)) return reply(r, 400, { error: 'url' });
  try { await send(b.url, str(b.msg, 300) || 'BLOCKHORIZON', okUrl(b.click) ? b.click : ''); reply(r, 200, { ok: true }); } catch (e) { reply(r, 502, { error: e.message }); }
}

export default { check, sync, test };
