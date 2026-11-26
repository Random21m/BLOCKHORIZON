// Phone notifications for alarms, on a node (the container with MEMPOOL_URL set). Runs inside nginx (njs), so the image
// needs no other program. Each browser that turns notifications on sends its alarms here (PUT /push/sync); once a
// minute check() reads the node's mempool through this container's own /api proxy and, for every alarm that is reached,
// sends the browser's own message (already in its language) to the ntfy topic it chose. A sent alarm is removed.
//
// The browser stays the owner of its alarms: it sends the whole list again whenever it changes and on every start, so a
// restart without a data volume loses nothing that matters. Alarms already reached when they arrive are not sent: the
// open browser shows those itself. An alarm sent once is not sent again for 30 days, even if a browser sends it back.
//
// Watched addresses (kind 'addr') work differently: they are never removed. For each one the node keeps the payments it
// has already seen (per browser, in `seen`), and sends a message for each new payment to it: one when it is first seen
// waiting, and one when it is confirmed. What is at an address when it is first watched is only recorded, not sent.
//
// Written for njs 0.8 (no destructuring, no spread, no `await` inside a call's arguments, no for...of).
import fs from 'fs';

// BH_DATA and BH_API are for tests/push.mjs (they need an `env` line in nginx.conf); the container uses the defaults.
const ENV = typeof process !== 'undefined' && process.env ? process.env : {};
const FILE = (ENV.BH_DATA || '/var/lib/blockhorizon') + '/push.json',
  API = ENV.BH_API || 'http://127.0.0.1/api';
const KEEP_SENT = 30 * 864e5,
  FIELDS = { next: 'fastestFee', h30: 'halfHourFee', h1: 'hourFee' };

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE));
    if (d && typeof d === 'object' && d.clients) return d;
  } catch (e) {
    /* none yet */
  }
  return { clients: {}, sent: {}, last: {} };
}
function save(d) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d));
  fs.renameSync(tmp, FILE);
}

// The shapes of Bitcoin addresses (mainnet, testnet, signet, regtest); the browser also checks bech32 checksums.
const okAddr = (s) =>
  typeof s === 'string' &&
  (/^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s) || /^(bc|tb|bcrt)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{8,87}$/.test(s));
const MAX_ADDR = 10;
const okUrl = (u) => typeof u === 'string' && u.length < 300 && /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(u);
const str = (s, n) => String(s == null ? '' : s).slice(0, n);

// One alarm as the browser sends it -> the few fields the check needs (anything else is dropped).
function clean(a) {
  if (!a || typeof a !== 'object') return null;
  const msg = str(a.msg, 300);
  if (!msg) return null;
  if (a.kind === 'height' && a.height > 0) return { kind: 'height', height: Math.floor(a.height), msg: msg };
  if (a.kind === 'tx' && /^[0-9a-f]{64}$/.test(a.txid)) return { kind: 'tx', txid: a.txid, msg: msg };
  if (a.kind === 'addr' && okAddr(a.addr) && str(a.msg2, 300))
    return { kind: 'addr', addr: a.addr, msg: msg, msg2: str(a.msg2, 300) };
  if (a.kind === 'fee' && FIELDS[a.level] && a.max > 0) return { kind: 'fee', level: a.level, max: +a.max, msg: msg };
  if (a.kind === 'price' && /^[A-Z]{3}$/.test(a.cur) && a.price > 0 && (a.dir === 'up' || a.dir === 'down'))
    return { kind: 'price', cur: a.cur, price: +a.price, dir: a.dir, msg: msg };
  return null;
}
const keyOf = (a) => [a.kind, a.height, a.level, a.max, a.cur, a.price, a.dir, a.txid, a.addr].join('|');

// The value an alarm watches, from the latest data: its height, fee level or price, or the block a watched
// transaction is in ({now} in its message).
function valueFor(a, last) {
  if (a.kind === 'height') return last.tip;
  if (a.kind === 'tx') return last.txs ? last.txs[a.txid] : undefined;
  if (a.kind === 'fee') return last.fees ? last.fees[FIELDS[a.level]] : undefined;
  return last.prices ? last.prices[a.cur] : undefined;
}
function reached(a, last) {
  if (a.kind === 'addr') return false; // watched for good; see addrEvents()
  const v = valueFor(a, last);
  if (typeof v !== 'number' || !isFinite(v)) return false;
  if (a.kind === 'height') return v >= a.height;
  if (a.kind === 'tx') return v > 0; // it is in a block
  if (a.kind === 'fee') return v <= a.max;
  return a.dir === 'up' ? v >= a.price : v <= a.price;
}

// The value for {now}, written the way the app writes it, with the browser's own number separators.
function fmtNow(a, v, c) {
  const d = a.kind === 'fee' ? (v < 10 ? 1 : 0) : a.kind === 'price' ? (v >= 1e5 ? 0 : v >= 100 ? 1 : 2) : 0;
  return fmtNum(v, d, c);
}
// Satoshis -> BTC without trailing zeros, as the app's fmtBtc writes it.
function fmtBtc(sats, c) {
  const s = (sats / 1e8).toFixed(8).replace(/0+$/, '').split('.');
  return fmtNum(sats / 1e8, s[1] ? s[1].length : 0, c);
}
function fmtNum(v, d, c) {
  const p = v.toFixed(d).split('.'),
    grp = typeof c.grp === 'string' ? c.grp : ',',
    dec = typeof c.dec === 'string' ? c.dec : '.';
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, grp) + (p[1] ? dec + p[1] : '');
}
// An address's recent transactions (the node's mempool API), as the payments to it: [{ t: txid, s: sats, c: 1 if
// confirmed, h: block height }]. A payment is what the transaction pays the address minus what it spends from it.
async function addrPayments(addr) {
  const txs = await getJSON('/address/' + addr + '/txs');
  const out = [];
  (Array.isArray(txs) ? txs : []).forEach((tx) => {
    if (!tx || typeof tx.txid !== 'string') return;
    let n = 0;
    (tx.vout || []).forEach((o) => {
      if (o && o.scriptpubkey_address === addr) n += o.value || 0;
    });
    (tx.vin || []).forEach((i) => {
      if (i && i.prevout && i.prevout.scriptpubkey_address === addr) n -= i.prevout.value || 0;
    });
    const conf = !!(tx.status && tx.status.confirmed);
    if (n > 0) out.push({ t: tx.txid, s: n, c: conf ? 1 : 0, h: conf ? tx.status.block_height : 0 });
  });
  return out;
}
// What is new since `seen` (txid -> 'm' waiting or 'c' confirmed; none yet = only record what is there now).
function addrEvents(seen, pays) {
  const next = {},
    events = [];
  pays.forEach((p) => {
    next[p.t] = p.c ? 'c' : 'm';
    if (!seen) return;
    const was = seen[p.t];
    if (!was || (was === 'm' && p.c)) events.push({ kind: p.c ? 'conf' : 'in', t: p.t, s: p.s, h: p.h });
  });
  return { seen: next, events: events };
}
async function getJSON(path) {
  const r = await ngx.fetch(API + path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}
// Only what the waiting alarms need.
async function fetchLast(alerts) {
  const last = { at: Date.now() },
    need = {};
  alerts.forEach((a) => {
    need[a.kind] = true;
  });
  if (need.height) {
    const r = await ngx.fetch(API + '/blocks/tip/height');
    if (r.ok) {
      const txt = await r.text();
      last.tip = parseInt(txt, 10);
    }
  }
  if (need.fee) last.fees = await getJSON('/v1/fees/recommended');
  if (need.price) last.prices = await getJSON('/v1/prices');
  if (need.tx) {
    // the block each watched transaction is in (none while it waits; a dropped one is simply not found)
    last.txs = {};
    const ids = [];
    alerts.forEach((a) => {
      if (a.kind === 'tx' && ids.indexOf(a.txid) < 0 && ids.length < 50) ids.push(a.txid);
    });
    for (let i = 0; i < ids.length; i++) {
      try {
        const s = await getJSON('/tx/' + ids[i] + '/status');
        if (s && s.confirmed && s.block_height > 0) last.txs[ids[i]] = s.block_height;
      } catch (e) {
        /* not found: dropped or replaced, or not seen yet */
      }
    }
  }
  if (need.addr) {
    last.addrs = {};
    const as = [];
    alerts.forEach((a) => {
      if (a.kind === 'addr' && as.indexOf(a.addr) < 0 && as.length < 50) as.push(a.addr);
    });
    for (let i = 0; i < as.length; i++) {
      try {
        last.addrs[as[i]] = await addrPayments(as[i]);
      } catch (e) {
        /* unknown to the node, or it did not answer: checked again next time */
      }
    }
  }
  return last;
}

async function send(url, msg, click) {
  const h = { Title: 'BLOCKHORIZON', Tags: 'alarm_clock', 'Content-Type': 'text/plain; charset=utf-8' };
  if (click) h.Click = click;
  const r = await ngx.fetch(url, { method: 'POST', headers: h, body: msg });
  if (!r.ok) throw new Error('ntfy ' + r.status);
}

function allAlerts(d) {
  const out = [];
  Object.keys(d.clients).forEach((id) => {
    (d.clients[id].alerts || []).forEach((a) => out.push(a));
  });
  return out;
}

// Once a minute (js_periodic). Does nothing, not even a request to the node, while no alarm is waiting.
async function check() {
  let d = load();
  const all = allAlerts(d);
  if (!all.length) return;
  let last;
  try {
    last = await fetchLast(all);
  } catch (e) {
    ngx.log(ngx.WARN, 'blockhorizon push: ' + e.message);
    return;
  }
  const done = [],
    seenNow = {}; // 'client address' -> the payments seen at that address now
  const ids = Object.keys(d.clients);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i],
      c = d.clients[id],
      list = c.alerts || [];
    for (let j = 0; j < list.length; j++) {
      const a = list[j];
      if (a.kind === 'addr') {
        const pays = last.addrs ? last.addrs[a.addr] : undefined;
        if (!pays) continue;
        const before = c.seen ? c.seen[a.addr] : undefined;
        const r = addrEvents(before, pays);
        for (let k = 0; k < r.events.length; k++) {
          const e = r.events[k];
          const text = (e.kind === 'in' ? a.msg : a.msg2)
            .replace(/\{amt\}/g, fmtBtc(e.s, c))
            .replace(/\{now\}/g, fmtNum(e.h, 0, c));
          try {
            await send(c.url, text, c.click);
          } catch (err) {
            ngx.log(ngx.WARN, 'blockhorizon push: ' + err.message);
            if (before && before[e.t]) r.seen[e.t] = before[e.t];
            else delete r.seen[e.t]; // tried again next minute
          }
        }
        seenNow[id + ' ' + a.addr] = r.seen;
        continue;
      }
      if (!reached(a, last)) continue;
      const now = fmtNow(a, valueFor(a, last), c);
      try {
        await send(c.url, a.msg.replace(/\{now\}/g, now), c.click);
        done.push(id + ' ' + keyOf(a));
      } catch (e) {
        ngx.log(ngx.WARN, 'blockhorizon push: ' + e.message);
      }
    }
  }
  // read again before writing: a browser may have sent a new list while this check was waiting on the network
  d = load();
  const t = Date.now();
  Object.keys(d.clients).forEach((id) => {
    const c = d.clients[id];
    c.alerts = (c.alerts || []).filter((a) => done.indexOf(id + ' ' + keyOf(a)) < 0);
    c.alerts.forEach((a) => {
      const s = seenNow[id + ' ' + a.addr];
      if (a.kind === 'addr' && s) {
        if (!c.seen) c.seen = {};
        c.seen[a.addr] = s;
      }
    });
  });
  done.forEach((k) => {
    d.sent[k] = t;
  });
  Object.keys(d.sent).forEach((k) => {
    if (t - d.sent[k] > KEEP_SENT) delete d.sent[k];
  });
  d.last = last;
  save(d);
}

function reply(r, code, obj) {
  r.headersOut['Content-Type'] = 'application/json';
  r.headersOut['Cache-Control'] = 'no-store';
  r.return(code, JSON.stringify(obj));
}
function body(r) {
  try {
    return JSON.parse(r.requestText || '');
  } catch (e) {
    return null;
  }
}

// PUT /push/sync { id, url, click, alerts }: this browser's alarms (an empty url turns it off for this browser).
async function sync(r) {
  if (r.method !== 'PUT') return reply(r, 405, { error: 'method' });
  const b = body(r);
  if (!b || typeof b.id !== 'string' || !/^[a-z0-9]{8,40}$/.test(b.id)) return reply(r, 400, { error: 'id' });
  const d = load();
  if (!b.url) {
    delete d.clients[b.id];
    save(d);
    return reply(r, 200, { ok: true, watching: 0 });
  }
  if (!okUrl(b.url)) return reply(r, 400, { error: 'url' });
  let list = (Array.isArray(b.alerts) ? b.alerts : []).slice(0, 200).map(clean).filter(Boolean);
  // what the node knows now, so an alarm the open browser is about to show itself is not also sent to the phone
  let last = d.last;
  if (!last || !last.at || Date.now() - last.at > 120000) {
    try {
      last = await fetchLast(list);
    } catch (e) {
      last = {};
    }
  }
  list = list.filter((a) => !d.sent[b.id + ' ' + keyOf(a)] && !reached(a, last));
  // watched addresses: at most MAX_ADDR; keep what was seen at the ones already watched, and note what is at a new one
  // now, so only payments from here on are sent
  let nAddr = 0;
  list = list.filter((a) => a.kind !== 'addr' || ++nAddr <= MAX_ADDR);
  const prev = d.clients[b.id],
    seen = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.kind !== 'addr' || seen[a.addr]) continue;
    if (prev && prev.seen && prev.seen[a.addr]) seen[a.addr] = prev.seen[a.addr];
    else {
      try {
        const pays = await addrPayments(a.addr);
        seen[a.addr] = addrEvents(null, pays).seen;
      } catch (e) {
        /* recorded at the next check instead */
      }
    }
  }
  d.clients[b.id] = {
    url: b.url,
    click: okUrl(b.click) ? b.click : '',
    grp: typeof b.grp === 'string' ? b.grp.slice(0, 2) : ',',
    dec: str(b.dec, 1) || '.',
    alerts: list,
    seen: seen,
    at: Date.now(),
  };
  save(d);
  reply(r, 200, { ok: true, watching: list.length });
}

// POST /push/test { url, msg }: send one message now, so the phone can be checked.
async function test(r) {
  if (r.method !== 'POST') return reply(r, 405, { error: 'method' });
  const b = body(r);
  if (!b || !okUrl(b.url)) return reply(r, 400, { error: 'url' });
  try {
    await send(b.url, str(b.msg, 300) || 'BLOCKHORIZON', okUrl(b.click) ? b.click : '');
    reply(r, 200, { ok: true });
  } catch (e) {
    reply(r, 502, { error: e.message });
  }
}

export default { check, sync, test };
