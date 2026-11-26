// BLOCKHORIZON pure helpers: no DOM, no network. Unit-tested in tests/lib.test.mjs.
export const EPOCH = 210000;
export const TARGET_SEC = 600;
export const MAX_SATS = 2100000000000000;
export const HALVINGS = [
  // known past halving dates (UTC ms) by epoch index
  Date.UTC(2009, 0, 3),
  Date.UTC(2012, 10, 28),
  Date.UTC(2016, 6, 9),
  Date.UTC(2020, 4, 11),
  Date.UTC(2024, 3, 20),
];

export function subsidy(h) {
  const e = Math.floor(h / EPOCH);
  return e >= 64 ? 0 : Math.floor(5000000000 / 2 ** e);
}
export function supplyAt(h) {
  // sats issued by blocks 0..h inclusive
  let s = 0,
    n = h + 1,
    e = 0;
  while (n > 0 && e < 64) {
    const c = Math.min(n, EPOCH);
    s += c * Math.floor(5000000000 / 2 ** e);
    n -= c;
    e++;
  }
  return s;
}
export function halvingInfo(h, nowMs = Date.now()) {
  const epoch = Math.floor(h / EPOCH),
    next = (epoch + 1) * EPOCH,
    togo = next - h;
  return {
    epoch,
    nextHeight: next,
    blocksToGo: togo,
    progress: (h - epoch * EPOCH) / EPOCH,
    subsidy: subsidy(h),
    nextSubsidy: subsidy(next),
    estMs: nowMs + togo * TARGET_SEC * 1000,
  };
}
// The last block that creates new bitcoin: the subsidy rounds down to 0 sats from epoch 33 on (block 6,930,000).
export const FINAL_BLOCK = (() => {
  let e = 0;
  while (Math.floor(5000000000 / 2 ** e) > 0) e++;
  return e * EPOCH - 1;
})();
// Countdown to it, from the last block's time at 10 minutes a block, so it ticks down smoothly and moves a little with each block.
export function finalCountdown(tip, lastTs, nowMs = Date.now()) {
  const blocks = FINAL_BLOCK - tip,
    estMs = (Number.isFinite(lastTs) ? lastTs * 1000 : nowMs) + blocks * TARGET_SEC * 1000;
  return { blocks, estMs, sec: Math.max(0, (estMs - nowMs) / 1000), done: blocks <= 0 };
}
// Long spans with years: "113y 297d 4h 12m 9s" (a year is 365.25 days).
export function fmtLong(sec) {
  sec = Math.max(0, Math.floor(sec));
  const Y = 31557600,
    y = Math.floor(sec / Y);
  sec -= y * Y;
  const d = Math.floor(sec / 86400),
    h = Math.floor((sec % 86400) / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  return (y ? `${y}${U.y} ` : '') + (y || d ? `${d}${U.d} ` : '') + `${h}${U.h} ${m}${U.m} ${s}${U.s}`;
}
export function futureEstimate(target, tip, nowMs = Date.now()) {
  const d = target - tip;
  return { blocks: d, ms: nowMs + d * TARGET_SEC * 1000, past: d <= 0 };
}
// Alarms reached at this tip height vs still waiting. A NaN tip (not loaded yet) reaches nothing.
export function splitAlarms(list, tip) {
  const all = Array.isArray(list) ? list : [];
  return { hit: all.filter((a) => tip >= a.height), rest: all.filter((a) => !(tip >= a.height)) };
}

export function fmtNum(n, d = 0, loc) {
  if (!Number.isFinite(n)) return '–';
  return n.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function fmtHashrate(h) {
  if (!Number.isFinite(h)) return '–';
  const u = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s', 'ZH/s'];
  let i = 0;
  while (h >= 1000 && i < u.length - 1) {
    h /= 1000;
    i++;
  }
  return fmtNum(h, h >= 100 ? 0 : 2) + ' ' + u[i];
}
export function fmtDifficulty(d) {
  if (!Number.isFinite(d)) return '–';
  const u = ['', 'K', 'M', 'G', 'T', 'P'];
  let i = 0;
  while (d >= 1000 && i < u.length - 1) {
    d /= 1000;
    i++;
  }
  return fmtNum(d, 2) + ' ' + u[i];
}
// Unit letters for durations, in the interface language (i18n.js sets them; English by default).
let U = { y: 'y', d: 'd', h: 'h', m: 'm', s: 's' };
export function setUnits(u) {
  if (u && u.d) U = u;
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86400),
    h = Math.floor((sec % 86400) / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  if (d) return `${d}${U.d} ${h}${U.h} ${m}${U.m}`;
  if (h) return `${h}${U.h} ${m}${U.m} ${s}${U.s}`;
  return `${m}${U.m} ${s}${U.s}`;
}
export function fmtAgo(sec) {
  if (sec < 90) return `${Math.max(0, Math.round(sec))}${U.s}`;
  if (sec < 5400) return `${Math.round(sec / 60)}${U.m}`;
  if (sec < 172800) return `${Math.round(sec / 3600)}${U.h}`;
  return `${Math.round(sec / 86400)}${U.d}`;
}
export function fmtFee(v) {
  return Number.isFinite(v) ? (v < 10 ? fmtNum(v, 1) : v < 1000 ? String(Math.round(v)) : fmtNum(Math.round(v))) : '–';
}
export function satsToBtc(s, d = 8) {
  return (s / 1e8).toFixed(d);
}
export function satsPerUnit(price) {
  return price > 0 ? Math.floor(1e8 / price) : NaN;
}
export function fmtDate(ms, o = {}) {
  const d = new Date(ms),
    p = (n) => String(n).padStart(2, '0');
  const utc = o.utc,
    Y = utc ? d.getUTCFullYear() : d.getFullYear(),
    M = (utc ? d.getUTCMonth() : d.getMonth()) + 1,
    D = utc ? d.getUTCDate() : d.getDate();
  let hh = utc ? d.getUTCHours() : d.getHours();
  const mm = utc ? d.getUTCMinutes() : d.getMinutes(),
    ss = utc ? d.getUTCSeconds() : d.getSeconds();
  let suf = '';
  if (o.h12) {
    suf = hh >= 12 ? ' PM' : ' AM';
    hh = hh % 12 || 12;
  }
  const date =
    o.dateFmt === 'dmy'
      ? `${p(D)}.${p(M)}.${Y}`
      : o.dateFmt === 'mdy'
        ? `${p(M)}/${p(D)}/${Y}`
        : `${Y}-${p(M)}-${p(D)}`;
  const time = `${o.h12 ? hh : p(hh)}:${p(mm)}${o.sec ? ':' + p(ss) : ''}${suf}`; // o.sec adds seconds, o.timeOnly drops the date (the live chart)
  return o.dateOnly ? date : o.timeOnly ? time : `${date} ${time}`;
}

// Hashrate series from mempool.space /v1/mining/hashrate/*: {hashrates:[{timestamp,avgHashrate}], currentHashrate}
export function hashrateAverages(series, current) {
  const pts = (series || []).filter((p) => Number.isFinite(p.avgHashrate)).sort((a, b) => a.timestamp - b.timestamp);
  const avg = (n) => {
    const s = pts.slice(-n);
    return s.length ? s.reduce((a, p) => a + p.avgHashrate, 0) / s.length : NaN;
  };
  return {
    current: Number.isFinite(current) ? current : pts.length ? pts[pts.length - 1].avgHashrate : NaN,
    d7: avg(7),
    d14: avg(14),
    d30: avg(30),
    d90: avg(90),
  };
}
// Block time stats from newest-first blocks array
export function blockTimeStats(blocks, nowSec = Date.now() / 1000) {
  const b = (blocks || []).slice().sort((x, y) => y.height - x.height);
  if (b.length < 2) return { avg: NaN, fast: 0, slow: 0, count: b.length, since: b[0] ? nowSec - b[0].timestamp : NaN };
  const gaps = [];
  for (let i = 0; i < b.length - 1; i++) gaps.push(b[i].timestamp - b[i + 1].timestamp);
  return {
    avg: gaps.reduce((a, g) => a + g, 0) / gaps.length,
    fast: gaps.filter((g) => g < TARGET_SEC).length,
    slow: gaps.filter((g) => g >= TARGET_SEC).length,
    count: b.length,
    since: nowSec - b[0].timestamp,
  };
}
export function parseDifficulty(d) {
  return {
    progress: d.progressPercent / 100,
    change: d.difficultyChange,
    blocksLeft: d.remainingBlocks,
    estMs: d.estimatedRetargetDate,
    prevChange: d.previousRetarget,
    prevTimeSec: d.previousTime,
    nextHeight: d.nextRetargetHeight,
  };
}
export function parseBlock(b) {
  const x = b.extras || {};
  return {
    id: b.id,
    height: b.height,
    ts: b.timestamp,
    txs: b.tx_count,
    size: b.size,
    weight: b.weight,
    reward: x.reward,
    fees: Number.isFinite(x.totalFees) ? x.totalFees : x.reward ? x.reward - subsidy(b.height) : NaN,
    medianFee: x.medianFee,
    feeRange: x.feeRange || [],
    pool: x.pool ? x.pool.name : '',
    empty: b.tx_count <= 1,
  };
}
export function mempoolDepth(info) {
  return info && info.vsize ? info.vsize / 1e6 : NaN;
}
export function parseTipHeight(text) {
  const n = parseInt(String(text).trim(), 10);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}
export function parseHeightInput(s) {
  const t = String(s)
    .trim()
    .replace(/[,_\s']/g, '');
  if (!/^\d{1,7}$/.test(t)) return NaN;
  return parseInt(t, 10);
}
// Moscow time "HH:MM" style: sats per dollar shown as clock
export function moscowTime(sats) {
  const s = String(Math.max(0, Math.min(9999, Math.floor(sats)))).padStart(4, '0');
  return s.slice(0, 2) + ':' + s.slice(2);
}
export function marketCapUsd(h, price) {
  return (supplyAt(h) / 1e8) * price;
}
// Axis labels: drop trailing zeros after the decimal point ("100.00K" -> "100K", "92.50 T" -> "92.5 T").
export const trimZeros = (s) => String(s).replace(/(\d)\.(\d*?)0+(?!\d)/g, (m, a, b) => a + (b ? '.' + b : ''));
export function compact(n) {
  const u = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [v, s] of u) if (Math.abs(n) >= v) return (n / v).toFixed(2) + s;
  return String(Math.round(n));
}

// Block colours follow the mempool.space convention so the two read the same: fee-rate colour ramp for upcoming blocks,
// purple-to-blue for mined blocks. (Colour values only; drawn in our own flat style.)
export const FEE_BREAKS = [
  0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500,
  600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000,
];
export const FEE_COLORS = [
  '007d3d',
  '557d00',
  '5d7d01',
  '637d02',
  '6d7d04',
  '757d05',
  '7d7d06',
  '867d08',
  '8c7d09',
  '957d0b',
  '9b7d0c',
  'a67d0e',
  'aa7d0f',
  'b27d10',
  'bb7d11',
  'bf7d12',
  'bf7815',
  'bf7319',
  'be6c1e',
  'be6820',
  'bd6125',
  'bd5c28',
  'bc552d',
  'bc4f30',
  'bc4a34',
  'bb4339',
  'bb3d3c',
  'bb373f',
  'ba3243',
  'b92b48',
  'b9254b',
  'b8214d',
  'b71d4f',
  'b61951',
  'b41453',
  'b30e55',
  'b10857',
  'b00259',
  'ae005b',
];
export const MINED_TOP = '#9339f4',
  MINED_BOTTOM = '#105fb0',
  MINED_EMPTY = '#2d3348',
  UPCOMING_EMPTY = '#554b45';
export function feeColor(fee) {
  let idx = 0;
  for (let i = 0; i < FEE_BREAKS.length; i++) if (fee >= FEE_BREAKS[i]) idx = i;
  return '#' + FEE_COLORS[idx];
}
// CSS background for an upcoming block: hard-edged vertical stripes, one per fee-range value (low to high, left to right)
export function feeStripes(feeRange) {
  const cols = (feeRange || [])
    .filter(Number.isFinite)
    .map(feeColor)
    .filter((c, i, a) => i === 0 || c !== a[i - 1]);
  if (!cols.length) return UPCOMING_EMPTY;
  const n = cols.length;
  if (n === 1) return cols[0];
  return (
    'linear-gradient(to right, ' +
    cols.map((c, i) => `${c} ${((i / n) * 100).toFixed(1)}% ${(((i + 1) / n) * 100).toFixed(1)}%`).join(', ') +
    ')'
  );
}

// ---- transactions ----
export function isTxid(s) {
  return /^[0-9a-f]{64}$/i.test(String(s).trim());
}
// mempool.space /api/tx/:txid -> what the transaction page shows. Confirmations need the current tip height.
export function parseTx(x, tip) {
  const s = x.status || {},
    vsize = Math.ceil((x.weight || 0) / 4);
  const out = (x.vout || []).reduce((a, o) => a + (o.value || 0), 0),
    coinbase = !!(x.vin && x.vin[0] && x.vin[0].is_coinbase);
  return {
    id: x.txid,
    confirmed: !!s.confirmed,
    height: s.block_height,
    time: s.block_time,
    confs:
      s.confirmed && Number.isFinite(tip) && tip >= s.block_height ? tip - s.block_height + 1 : s.confirmed ? 1 : 0,
    fee: x.fee || 0,
    vsize,
    feeRate: vsize ? (x.fee || 0) / vsize : NaN,
    ins: (x.vin || []).length,
    outs: (x.vout || []).length,
    valueOut: out,
    coinbase,
  };
}
// Where a transaction's coins came from and where they went, for its page. An input is the output of an earlier
// transaction (txid, vout); new coins in a block (coinbase) have none. An output without an address is data (op_return)
// or an old script type.
export function txFlow(x) {
  const ins = (x.vin || []).map((i) => {
    const p = i.prevout || {};
    return i.is_coinbase
      ? { coinbase: true }
      : {
          addr: p.scriptpubkey_address || null,
          value: Number.isFinite(p.value) ? p.value : null,
          type: p.scriptpubkey_type || '',
          txid: i.txid,
          vout: i.vout,
        };
  });
  const outs = (x.vout || []).map((o, n) => ({
    n,
    addr: o.scriptpubkey_address || null,
    value: o.value || 0,
    type: o.scriptpubkey_type || '',
  }));
  return { ins, outs };
}
// A past block as a picture: a cols x rows grid where each cell is an equal slice of the block's space (in vB, of at
// least a full block's 1,000,000 vB), filled in order of fee rate from the bottom row up (highest fees at the bottom,
// as on the Mining page). Each cell holds the index (into `list`, the transactions by fee rate) of the transaction
// that covers the middle of its slice, or -1 when the block was not that full. The coinbase is left out: it pays no fee.
export function blockCells(summary, cols, rows) {
  const list = (Array.isArray(summary) ? summary : [])
      .filter((x, i) => !(i === 0 && !x.fee))
      .sort((a, b) => b.rate - a.rate),
    total = list.reduce((a, x) => a + (x.vsize || 0), 0),
    n = cols * rows,
    unit = Math.max(total, 1e6) / n,
    cells = new Array(n).fill(-1);
  let j = 0,
    end = list.length ? list[0].vsize || 0 : 0;
  for (let k = 0; k < n; k++) {
    const mid = (k + 0.5) * unit;
    if (mid > total) break;
    while (j < list.length - 1 && mid > end) end += list[++j].vsize || 0;
    cells[(rows - 1 - Math.floor(k / cols)) * cols + (k % cols)] = j; // bottom row first
  }
  return { list, cells, unit };
}
// A round amount, in steps of 0.001 BTC: what people usually pay, unlike the odd change that comes back.
export const isRoundSats = (v) => v > 0 && v % 100000 === 0;
// Privacy hints anyone looking at a transaction can read from it, worked out here in the browser (nothing is sent):
// 'reuse'  coins go back to an address that also spends in it,
// 'merge'  coins from several addresses spent together (they likely belong to one wallet),
// 'round'  one output is round and another is not (the odd one is likely the change),
// 'types'  only one output has the inputs' address type (likely the change).
export function txPrivacy(x) {
  const f = txFlow(x);
  if (!f.ins.length || f.ins.some((i) => i.coinbase)) return [];
  const hints = [],
    from = new Set(f.ins.map((i) => i.addr).filter(Boolean)),
    pay = f.outs.filter((o) => o.type !== 'op_return' && o.value > 0);
  if (pay.some((o) => o.addr && from.has(o.addr))) hints.push('reuse');
  if (from.size > 1) hints.push('merge');
  if (pay.length >= 2 && pay.some((o) => isRoundSats(o.value)) && pay.some((o) => !isRoundSats(o.value)))
    hints.push('round');
  const types = new Set(f.ins.map((i) => i.type).filter(Boolean));
  if (pay.length >= 2 && types.size === 1) {
    const same = pay.filter((o) => types.has(o.type)).length;
    if (same === 1) hints.push('types');
  }
  return hints;
}
// Which projected block an unconfirmed fee rate falls into (0 = the next block), or -1 if below every projected block.
export function txQueuePos(feeRate, projected) {
  const p = projected || [];
  for (let i = 0; i < p.length; i++) {
    const lo = p[i].feeRange && p[i].feeRange.length ? p[i].feeRange[0] : p[i].medianFee;
    if (feeRate >= lo) return i;
  }
  return -1;
}
// A waiting transaction below the next block's fee rate: what speeding it up would cost, in sats, at `rate` sat/vB.
// Replacing it (RBF) means paying the whole transaction at that rate, and at least 1 sat/vB more than it paid (the
// network's minimum step). A follow-up that spends one of its outputs (CPFP, about CHILD_VB) pays for both together.
export const CHILD_VB = 110;
export function speedUp(tx, rate) {
  if (!tx || !(tx.vsize > 0) || !(rate > 0)) return null;
  const fee = tx.fee || 0;
  return {
    stuck: fee / tx.vsize < rate,
    rbf: Math.max(Math.ceil(rate * tx.vsize), fee + tx.vsize),
    cpfp: Math.max(0, Math.ceil(rate * (tx.vsize + CHILD_VB) - fee)),
  };
}
// Approximate virtual size of a payment (vB) for the common address types: inputs, outputs and the fixed overhead.
export const TX_SIZES = {
  segwit: { base: 10.5, in: 68, out: 31 },
  taproot: { base: 10.5, in: 57.5, out: 43 },
  legacy: { base: 10, in: 148, out: 34 },
};
export function txVsize(ins, outs, type = 'segwit') {
  const s = TX_SIZES[type] || TX_SIZES.segwit,
    i = Math.max(1, Math.floor(ins) || 1),
    o = Math.max(1, Math.floor(outs) || 1);
  return Math.ceil(s.base + i * s.in + o * s.out);
}

// ---- fee alerts ----
// Which mempool.space /v1/fees/recommended field each alert speed watches.
export const FEE_LEVELS = { next: 'fastestFee', h30: 'halfHourFee', h1: 'hourFee' };
// Alerts whose fee level is now at or below their limit vs still waiting. Missing fee data reaches nothing.
export function splitFeeAlerts(list, fees) {
  const all = Array.isArray(list) ? list : [],
    now = (a) => (fees ? fees[FEE_LEVELS[a.level] || FEE_LEVELS.next] : NaN);
  const hit = all.filter((a) => Number.isFinite(now(a)) && now(a) <= a.max);
  return { hit, rest: all.filter((a) => !hit.includes(a)) };
}
export function parseFeeLimit(s) {
  const v = parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(v) && v > 0 && v < 100000 ? v : NaN;
}

// ---- history charts ----
// mempool.space responses -> ascending [{ t: ms, v }] series. Missing or unavailable values (the API uses -1) are dropped.
const asc = (pts) =>
  pts.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.t - b.t);
export const SERIES = {
  price: (r, cur) => asc(((r && r.prices) || []).map((p) => ({ t: p.time * 1000, v: p[cur] }))),
  hashrate: (r) => asc(((r && r.hashrates) || []).map((p) => ({ t: p.timestamp * 1000, v: p.avgHashrate }))),
  difficulty: (r) => asc(((r && r.difficulty) || []).map((p) => ({ t: p.time * 1000, v: p.difficulty }))),
  // Median fee rate per group of blocks. Often 0 in quiet times: a real value, so kept (unlike missing prices).
  fees: (r) =>
    (Array.isArray(r) ? r : [])
      .map((p) => ({ t: p.timestamp * 1000, v: p.avgFee_50 }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v >= 0)
      .sort((a, b) => a.t - b.t),
  // Average fees per block (sats -> BTC), from /v1/mining/blocks/fees. Zero in the early years: kept, like the fee rate.
  blockFees: (r) => zeroOk(r, (p) => p.avgFees / 1e8),
  // Average block size (bytes -> MB), from /v1/mining/blocks/sizes-weights.
  blockSizes: (r) => zeroOk(r && r.sizes, (p) => p.avgSize / 1e6),
};
const zeroOk = (r, f) =>
  (Array.isArray(r) ? r : [])
    .map((p) => ({ t: p.timestamp * 1000, v: f(p) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v >= 0)
    .sort((a, b) => a.t - b.t);
// Fees as a share (%) of what miners earned (subsidy + fees), from /v1/mining/blocks/fees and /rewards: each fee point
// matched with the reward point nearest in height (the two lists are grouped the same way, but can differ by one).
export function feeShareSeries(fees, rewards) {
  const rw = (Array.isArray(rewards) ? rewards : [])
    .filter((p) => p && p.avgRewards > 0 && Number.isFinite(p.avgHeight))
    .map((p) => ({ t: p.avgHeight, v: p.avgRewards }))
    .sort((a, b) => a.t - b.t);
  if (!rw.length) return [];
  return (Array.isArray(fees) ? fees : [])
    .filter((p) => p && Number.isFinite(p.avgFees) && Number.isFinite(p.avgHeight))
    .map((p) => {
      const q = rw[nearest(rw, p.avgHeight)];
      return { t: p.timestamp * 1000, v: Math.min(100, (p.avgFees / q.v) * 100) };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}
export const RANGES = { '1m': 30 * 864e5, '1y': 365 * 864e5, all: Infinity };
export function inRange(pts, range, now = Date.now()) {
  const span = RANGES[range] || Infinity;
  return span === Infinity ? pts : pts.filter((p) => p.t >= now - span);
}
// ---- Trading chart (Kraken candles) ----
// Timeframes: key -> minutes (Kraken's own intervals, for both REST and websocket).
export const TIMEFRAMES = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440, '1W': 10080 };
// Kraken's REST pair names (it calls bitcoin XBT).
export const krakenPair = (cur) => 'XBT' + cur;
const candle = (t, o, h, l, c, v) => ({ t, o, h, l, c, v });
const okCandle = (k) =>
  Number.isFinite(k.t) && [k.o, k.h, k.l, k.c].every((x) => Number.isFinite(x) && x > 0) && Number.isFinite(k.v);
// Pure: Kraken REST /0/public/OHLC JSON -> candles ascending ({t: open time ms, o, h, l, c, v}). Rows: [time, o, h, l, c, vwap, volume, count].
export function parseKrakenRest(r) {
  if (!r || (Array.isArray(r.error) && r.error.length) || !r.result) return [];
  const k = Object.keys(r.result).find((x) => x !== 'last' && Array.isArray(r.result[x]));
  if (!k) return [];
  return r.result[k]
    .map((x) => candle(x[0] * 1000, +x[1], +x[2], +x[3], +x[4], +x[6]))
    .filter(okCandle)
    .sort((a, b) => a.t - b.t);
}
// Pure: Kraken v2 websocket text -> { type: 'snapshot'|'update', cur, interval, candles } for BTC ohlc frames, else null.
export function parseOhlc(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || m.channel !== 'ohlc' || (m.type !== 'snapshot' && m.type !== 'update') || !Array.isArray(m.data))
      return null;
    let cur = '',
      interval = 0;
    const candles = m.data
      .filter((d) => d && /^BTC\/[A-Z]{3}$/.test(d.symbol))
      .map((d) => {
        cur = d.symbol.slice(4);
        interval = d.interval;
        return candle(Date.parse(d.interval_begin), d.open, d.high, d.low, d.close, d.volume);
      })
      .filter(okCandle)
      .sort((a, b) => a.t - b.t);
    return candles.length ? { type: m.type, cur, interval, candles } : null;
  } catch {
    return null;
  }
}
// Merge newer candles into an ascending series: same open time replaces, later ones append, older ones are ignored
// unless they fill a gap. Keeps at most `max` (the oldest drop off).
export function mergeCandles(series, add, max = 2000) {
  const out = series.slice();
  for (const k of add) {
    const last = out[out.length - 1];
    if (!last || k.t > last.t) out.push(k);
    else if (k.t === last.t) out[out.length - 1] = k;
    else {
      let lo = 0,
        hi = out.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (out[m].t < k.t) lo = m + 1;
        else hi = m;
      }
      if (out[lo].t === k.t) out[lo] = k;
      else out.splice(lo, 0, k);
    }
  }
  return out.length > max ? out.slice(out.length - max) : out;
}
// Time axis spacing for the trading chart: the smallest round step (minutes; 43200 = a month) that keeps labels ~100 px apart.
export const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080, 43200, 129600, 525600];
export function timeStep(tfMinutes, pxPerCandle, minPx = 100) {
  return TIME_STEPS.find((s) => s >= tfMinutes && (s / tfMinutes) * pxPerCandle >= minPx) || 525600;
}
// Does a step boundary fall in (prev, t]? Hours and days count in local time (or UTC); months and years on the calendar.
export function onStep(t, prev, step, utc) {
  const d = new Date(t),
    p = new Date(prev),
    mo = (x) => (utc ? x.getUTCFullYear() * 12 + x.getUTCMonth() : x.getFullYear() * 12 + x.getMonth());
  if (step >= 43200) {
    const n = step / 43200;
    return Math.floor(mo(d) / n) !== Math.floor(mo(p) / n);
  }
  const off = (x) => (utc ? 0 : x.getTimezoneOffset() * 6e4),
    k = (ms, x) => Math.floor((ms - off(x)) / (step * 6e4));
  if (step === 10080) {
    const wk = (ms, x) => Math.floor((ms - off(x) - 4 * 864e5) / 6048e5);
    return wk(t, d) !== wk(prev, p);
  } // weeks start Monday
  return k(t, d) !== k(prev, p);
}
// Moving averages and RSI over closes. Entries before there is enough data are NaN (not drawn).
export function sma(vals, n) {
  const out = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= n) sum -= vals[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}
export function ema(vals, n) {
  const out = new Array(vals.length).fill(NaN),
    k = 2 / (n + 1);
  if (vals.length < n) return out;
  let e = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = e; // seeded with the simple average
  for (let i = n; i < vals.length; i++) {
    e = vals[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}
// Wilder's RSI.
export function rsi(vals, n = 14) {
  const out = new Array(vals.length).fill(NaN);
  if (vals.length <= n) return out;
  let g = 0,
    l = 0;
  for (let i = 1; i <= n; i++) {
    const d = vals[i] - vals[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  g /= n;
  l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
// Bollinger Bands (n, k standard deviations) and MACD (fast, slow, signal) over closes; NaN until there is enough data.
export function bollinger(vals, n = 20, k = 2) {
  const mid = sma(vals, n),
    up = mid.slice(),
    lo = mid.slice();
  for (let i = n - 1; i < vals.length; i++) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (vals[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / n);
    up[i] = mid[i] + k * sd;
    lo[i] = mid[i] - k * sd;
  }
  return { mid, up, lo };
}
export function macd(vals, fast = 12, slow = 26, sig = 9) {
  const f = ema(vals, fast),
    s = ema(vals, slow),
    line = vals.map((_, i) => f[i] - s[i]);
  const start = line.findIndex(Number.isFinite),
    signal = new Array(vals.length).fill(NaN);
  if (start >= 0) {
    const e = ema(line.slice(start), sig);
    for (let i = 0; i < e.length; i++) signal[start + i] = e[i];
  }
  return { macd: line, signal, hist: line.map((v, i) => v - signal[i]) };
}
// ---- Order book and trades (Kraken v2 websocket) ----
// Kraken's precision for BTC pairs: prices to 0.1 (JPY to 1), amounts to 8 decimals. Used by the book checksum.
export const pricePrecision = (cur) => (cur === 'JPY' ? 0 : 1);
const lvl = (x) => ({ p: x.price, q: x.qty });
// Pure: raw text -> { type, cur, bids, asks, checksum } for a BTC book frame, else null.
export function parseBook(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || m.channel !== 'book' || !Array.isArray(m.data) || !m.data[0]) return null;
    const d = m.data[0];
    if (!/^BTC\/[A-Z]{3}$/.test(d.symbol)) return null;
    const ok = (a) =>
      (Array.isArray(a) ? a : []).filter((x) => x && Number.isFinite(x.price) && Number.isFinite(x.qty)).map(lvl);
    return { type: m.type, cur: d.symbol.slice(4), bids: ok(d.bids), asks: ok(d.asks), checksum: d.checksum };
  } catch {
    return null;
  }
}
// Apply a frame to a book ({bids: best first, asks: best first}). A snapshot replaces it; in an update an amount of 0
// removes the level. Levels beyond `depth` are dropped, as Kraken expects.
export function applyBook(book, f, depth = 25) {
  const side = (cur, ch, desc) => {
    const m = new Map(f.type === 'snapshot' ? [] : cur.map((x) => [x.p, x.q]));
    for (const x of ch) {
      if (x.q === 0) m.delete(x.p);
      else m.set(x.p, x.q);
    }
    return [...m]
      .map(([p, q]) => ({ p, q }))
      .sort((a, b) => (desc ? b.p - a.p : a.p - b.p))
      .slice(0, depth);
  };
  return { bids: side(book ? book.bids : [], f.bids, true), asks: side(book ? book.asks : [], f.asks, false) };
}
// CRC32 (IEEE), as Kraken's book checksum uses.
let CRC;
export function crc32(str) {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) c = CRC[(c ^ str.charCodeAt(i)) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Kraken's checksum of the top 10 asks then the top 10 bids: price and amount at their precision, without the point or leading zeros.
export function bookChecksum(book, pp, qp = 8) {
  const f = (v, d) => v.toFixed(d).replace('.', '').replace(/^0+/, '');
  const part = (a) =>
    a
      .slice(0, 10)
      .map((x) => f(x.p, pp) + f(x.q, qp))
      .join('');
  return crc32(part(book.asks) + part(book.bids));
}
// Pure: raw text -> { type, cur, trades: [{ id, t, side, p, q }] } (newest last) for BTC trade frames, else null.
export function parseTrades(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || m.channel !== 'trade' || !Array.isArray(m.data)) return null;
    let cur = '';
    const trades = m.data
      .filter((d) => d && /^BTC\/[A-Z]{3}$/.test(d.symbol) && Number.isFinite(d.price) && Number.isFinite(d.qty))
      .map((d) => {
        cur = d.symbol.slice(4);
        return {
          id: d.trade_id,
          t: Date.parse(d.timestamp),
          side: d.side === 'sell' ? 'sell' : 'buy',
          p: d.price,
          q: d.qty,
        };
      });
    return trades.length ? { type: m.type, cur, trades } : null;
  } catch {
    return null;
  }
}
// ---- Price alerts: { id, cur, price, dir: 'up' | 'down', sound } fire once when the price reaches them ----
export const alertDir = (target, now) => (target >= now ? 'up' : 'down');
export function splitPriceAlerts(list, prices) {
  const hit = [],
    rest = [];
  for (const a of list || []) {
    const p = prices && prices[a.cur];
    (Number.isFinite(p) && (a.dir === 'up' ? p >= a.price : p <= a.price) ? hit : rest).push(a);
  }
  return { hit, rest };
}
// "60,000", "60.000,5", "100.000", "59 500.5", "1,5": the last of ',' and '.' is the decimal mark when both appear; a lone ',' is
// a thousands mark only in groups of three.
export function parsePriceInput(s) {
  let x = String(s)
    .trim()
    .replace(/[\s'’]/g, '');
  const lc = x.lastIndexOf(','),
    ld = x.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) x = lc > ld ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (lc >= 0) x = /^\d{1,3}(,\d{3})+$/.test(x) ? x.replace(/,/g, '') : x.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); // '100.000' is a price of 100 000 (bitcoin is never priced near 100)
  if (!/^\d+(\.\d+)?$/.test(x)) return NaN;
  const v = parseFloat(x);
  return v > 0 && v < 1e12 ? v : NaN;
}
// Price label precision for a value (JPY prices are big, small moves still need cents elsewhere).
export const priceDigits = (v) => (v >= 1e5 ? 0 : v >= 100 ? 1 : 2);

// At most n points, evenly spread by index, always keeping the first and the last.
export function thin(pts, n = 400) {
  if (pts.length <= n) return pts;
  const out = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
  return out;
}
// Axis ticks. Linear: 1/2/5 x 10^k steps covering [lo, hi]. Log: powers of ten inside the range (with 2 and 5 between when few).
export function ticks(lo, hi, log, count = 4) {
  if (!(hi > lo)) return [lo];
  if (log) {
    const out = [],
      a = Math.floor(Math.log10(lo)),
      b = Math.ceil(Math.log10(hi));
    for (let e = a; e <= b; e++)
      for (const m of b - a <= 2 ? [1, 2, 5] : [1]) {
        const v = m * 10 ** e;
        if (v >= lo && v <= hi) out.push(v);
      }
    return out.length ? out : [lo, hi];
  }
  const raw = (hi - lo) / count,
    mag = 10 ** Math.floor(Math.log10(raw)),
    step = [1, 2, 5, 10]
      .map((m) => m * mag)
      .reduce((a, s) => (Math.abs(Math.log(s / raw)) < Math.abs(Math.log(a / raw)) ? s : a)); // the 1/2/5 step nearest the ideal
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
// Index of the point nearest to time t (points ascending).
export function nearest(pts, t) {
  let lo = 0,
    hi = pts.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (pts[m].t < t) lo = m;
    else hi = m;
  }
  return Math.abs(pts[lo].t - t) <= Math.abs(pts[hi].t - t) ? lo : hi;
}
// Trailing mean over the last `days` days at each point (ascending series). days <= 0 returns the series unchanged.
export function smoothDays(pts, days) {
  if (!(days > 0)) return pts;
  const w = days * 864e5,
    out = [];
  let j = 0,
    sum = 0;
  for (let i = 0; i < pts.length; i++) {
    sum += pts[i].v;
    while (pts[i].t - pts[j].t >= w) sum -= pts[j++].v;
    out.push({ t: pts[i].t, v: sum / (i - j + 1) });
  }
  return out;
}

// ---- Long-term charts (all time, from the price history and the difficulty adjustments) ----
const DAY = 864e5;
// An ascending series -> one point per UTC day, each day carrying the last value known by then (the price history is
// weekly in its early years and finer later, so averages over days need an even grid).
export function daily(pts) {
  if (!pts || !pts.length) return [];
  const out = [],
    end = Math.floor(pts[pts.length - 1].t / DAY) * DAY;
  let j = 0;
  for (let d = Math.floor(pts[0].t / DAY) * DAY; d <= end; d += DAY) {
    while (j + 1 < pts.length && pts[j + 1].t < d + DAY) j++;
    out.push({ t: d, v: pts[j].v });
  }
  return out;
}
// Trailing mean of a daily series over `days` days, from the first day with a full window.
export function movingAvg(day, days) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < day.length; i++) {
    sum += day[i].v;
    if (i >= days) sum -= day[i - days].v;
    if (i >= days - 1) out.push({ t: day[i].t, v: sum / days });
  }
  return out;
}
// The 200-week moving average of the price (1,400 days).
export const ma200w = (price) => movingAvg(daily(price), 1400);
// Mayer Multiple: the price divided by its 200-day moving average.
export function mayer(price) {
  const d = daily(price),
    ma = movingAvg(d, 200),
    off = d.length - ma.length;
  return ma.map((m, i) => ({ t: m.t, v: d[i + off].v / m.v }));
}
// Price after each halving as a multiple of the price on the halving day, by days since it (t = days in ms, so the
// charts' time axis works). Halvings before the price history starts are left out.
export function halvingCycles(price, halvings = HALVINGS.slice(1), now = Date.now()) {
  const d = daily(price);
  if (!d.length) return [];
  return halvings
    .map((h, i) => {
      const start = Math.floor(h / DAY) * DAY,
        end = Math.min(halvings[i + 1] || Infinity, now);
      const k = d.findIndex((p) => p.t >= start);
      if (k < 0 || d[k].t - start > 7 * DAY) return null;
      const base = d[k].v,
        pts = [];
      for (let j = k; j < d.length && d[j].t < end; j++) pts.push({ t: d[j].t - d[k].t, v: d[j].v / base });
      return { year: new Date(h).getUTCFullYear(), pts };
    })
    .filter((c) => c && c.pts.length > 1);
}
// Bitcoins issued over time, from the difficulty adjustments (each has a time and a block height).
export const supplySeries = (r) =>
  asc(
    ((r && r.difficulty) || []).map((p) => ({ t: p.time * 1000, v: p.height >= 0 ? supplyAt(p.height) / 1e8 : NaN }))
  );

// The value of the bitcoins issued each day, in the price's currency: the day's blocks (at the pace of its difficulty
// period, from the adjustments' heights and times) × the block subsidy then × that day's price. Fees are left out.
export function issuanceValue(r, price) {
  const ep = ((r && r.difficulty) || [])
    .filter((p) => p && p.height >= 0 && p.time > 0)
    .map((p) => ({ t: p.time * 1000, h: p.height }))
    .sort((a, b) => a.t - b.t);
  if (ep.length < 2) return [];
  const out = [];
  let j = 0;
  for (const p of daily(price)) {
    if (p.t < ep[0].t) continue;
    while (j + 2 < ep.length && ep[j + 1].t <= p.t) j++;
    const a = ep[j],
      b = ep[j + 1],
      rate = (b.h - a.h) / ((b.t - a.t) / DAY), // blocks a day in this period (after the last adjustment: the last pace)
      h = a.h + (rate * (p.t - a.t)) / DAY;
    out.push({ t: p.t, v: ((rate * subsidy(Math.round(h))) / 1e8) * p.v });
  }
  return out;
}
// Puell Multiple: the value issued each day divided by its 365-day average.
export function puell(r, price) {
  const d = issuanceValue(r, price),
    ma = movingAvg(d, 365),
    off = d.length - ma.length;
  return ma.map((m, i) => ({ t: m.t, v: d[i + off].v / m.v }));
}
// Hash ribbons: the 30- and 60-day averages of the hashrate. `down` while the 30-day one is below (miners switching off,
// "capitulation"), and since when it has been on that side.
export function hashRibbons(r) {
  const d = daily(SERIES.hashrate(r)),
    short = movingAvg(d, 30),
    long = movingAvg(d, 60);
  if (!long.length) return { short, long, down: false, since: NaN };
  const off = short.length - long.length,
    below = (i) => short[i + off].v < long[i].v,
    down = below(long.length - 1);
  let i = long.length - 1;
  while (i > 0 && below(i - 1) === down) i--;
  return { short, long, down, since: long[i].t };
}
// Difficulty ribbon: moving averages of the difficulty over 9 to 200 days. When they bunch together, difficulty has
// stopped rising; `spread` is how far apart (in %) the highest and lowest are on the last day.
export const RIBBON_DAYS = [9, 14, 25, 40, 60, 90, 128, 200];
export function diffRibbon(r) {
  const d = daily(SERIES.difficulty(r)),
    lines = RIBBON_DAYS.map((n) => ({ days: n, pts: movingAvg(d, n) })),
    last = lines.map((l) => (l.pts.length ? l.pts[l.pts.length - 1].v : NaN)).filter(Number.isFinite);
  return {
    diff: d,
    lines,
    spread: last.length ? (Math.max(...last) / Math.min(...last) - 1) * 100 : NaN,
  };
}
// The last `days` days of a series (counted back from its last point).
export const lastDays = (pts, days) =>
  pts.length ? pts.filter((p) => p.t >= pts[pts.length - 1].t - days * DAY) : pts;

// ---- "Your block": a personal date on the chain ----
export const GENESIS_TS = 1231006505; // 2009-01-03 18:15:05 UTC
// 'YYYY-MM-DD' -> unix seconds at 12:00 UTC that day (the middle of the day in most time zones), or NaN.
export function noonTs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return NaN;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  const d = new Date(ms);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? ms / 1000 : NaN;
}
// The next round number of blocks since a height: steps of 100 below 1,000, then 1,000, 10,000 and 100,000.
export function nextMilestone(since) {
  const step = since < 1000 ? 100 : since < 10000 ? 1000 : since < 100000 ? 10000 : 100000;
  const n = (Math.floor(Math.max(0, since) / step) + 1) * step;
  return { blocks: n, inBlocks: n - since };
}
// A future time -> the block expected then, at one block every 10 minutes from the tip.
export function heightAt(ts, tip, nowMs = Date.now()) {
  return tip + Math.round((ts * 1000 - nowMs) / (TARGET_SEC * 1000));
}
// mempool.space /v1/historical-price?timestamp= -> the price for that time (the latest entry at or before it), or NaN.
export function priceAt(resp, cur, ts) {
  const pts = ((resp && resp.prices) || [])
    .filter((p) => Number.isFinite(p[cur]) && p[cur] > 0 && p.time <= ts + 7 * 86400)
    .sort((a, b) => a.time - b.time);
  const before = pts.filter((p) => p.time <= ts);
  const p = before.length ? before[before.length - 1] : pts[0];
  return p ? p[cur] : NaN;
}
// ---- the block being mined ----
export const TWO32 = 4294967296; // a difficulty of 1 takes 2^32 hashes on average
// Average seconds to find a block at this difficulty and hashrate (falls back to the 10-minute target without data).
export function expectedBlockSec(difficulty, hashrate) {
  return difficulty > 0 && hashrate > 0 ? (difficulty * TWO32) / hashrate : TARGET_SEC;
}
// Mining has no memory: the chance of a block within the next `sec` seconds is the same however long the search has run.
export function chanceWithin(sec, mean) {
  return sec > 0 && mean > 0 ? 1 - Math.exp(-sec / mean) : 0;
}
// The number a block's hash must not exceed, as 64 hex digits: 0xffff * 2^208 / difficulty.
export function miningTarget(difficulty) {
  if (!(difficulty >= 1) || !Number.isFinite(difficulty)) return null;
  return ((0xffffn << 208n) / BigInt(Math.round(difficulty))).toString(16).padStart(64, '0');
}
export function leadingZeros(hex) {
  return (/^0*/.exec(String(hex || '')) || [''])[0].length;
}
// Each pool's share of the blocks in a mining/pools response, largest first; the rest are summed as one entry (name null).
export function poolShares(resp, top = 6) {
  const ps = ((resp && resp.pools) || []).filter((p) => p.blockCount > 0).sort((a, b) => b.blockCount - a.blockCount),
    total = ps.reduce((s, p) => s + p.blockCount, 0);
  if (!total) return [];
  const out = ps.slice(0, top).map((p) => ({ name: p.name, share: p.blockCount / total, blocks: p.blockCount })),
    rest = ps.slice(top).reduce((s, p) => s + p.blockCount, 0);
  if (rest) out.push({ name: null, share: rest / total, blocks: rest });
  return out;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
// Very large counts as 4.1 × 10²³ (plain digits below a million).
export function fmtSci(n) {
  if (!Number.isFinite(n)) return '–';
  if (Math.abs(n) < 1e6) return fmtNum(n);
  let e = Math.floor(Math.log10(Math.abs(n))),
    m = n / 10 ** e;
  if (Math.abs(m) >= 9.95) {
    m /= 10;
    e++;
  }
  return (
    m.toFixed(1) +
    ' × 10' +
    String(e)
      .split('')
      .map((d) => SUP[d])
      .join('')
  );
}
// ---- the block picture: every transaction as a square ----
// A feed row from mempool.space ([txid, fee, vsize, value, rate, ...]) as a transaction.
export const ptx = (r) => ({ id: r[0], fee: r[1], vsize: r[2], rate: r[4] });
// Apply a projected-block-transactions frame (a full list, or a delta of added / removed / changed) to a Map of txid -> tx.
export function applyBlockFrame(map, f) {
  if (!f) return map;
  if (Array.isArray(f.blockTransactions)) {
    map.clear();
    for (const r of f.blockTransactions) map.set(r[0], ptx(r));
    return map;
  }
  const d = f.delta || {};
  for (const id of d.removed || []) map.delete(id);
  for (const r of d.added || []) map.set(r[0], ptx(r));
  for (const [id, rate] of d.changed || []) {
    const x = map.get(id);
    if (x && Number.isFinite(rate)) map.set(id, Object.assign({}, x, { rate }));
  }
  return map;
}
// Pack transactions into a grid x grid block, highest fee rate first from the bottom left, each a square whose area is its
// size. The cell size grows until everything fits, so a full block fills the square. y counts up from the bottom.
export function packBlock(list, grid = 75) {
  const txs = list.filter((t) => t.vsize > 0).sort((a, b) => b.rate - a.rate || b.vsize - a.vsize),
    cap = grid * grid * 0.94;
  // pick the cell size so the squares cover the share of the block that is full (rounding small ones up costs area)
  const goal = cap * Math.min(1, txs.reduce((a, t) => a + t.vsize, 0) / 1e6);
  let unit = 1e6 / (grid * grid),
    lo = unit / 50,
    hi = unit * 50;
  const side = (v) => Math.max(1, Math.min(grid, Math.round(Math.sqrt(v / unit)))),
    area = () => txs.reduce((a, t) => a + side(t.vsize) ** 2, 0);
  for (let k = 0; k < 24; k++) {
    unit = Math.sqrt(lo * hi);
    if (area() > goal) lo = unit;
    else hi = unit;
  }
  unit = hi;
  const occ = new Uint8Array(grid * grid),
    first = new Int32Array(grid),
    out = [];
  let low = 0;
  const free = (x, y, s) => {
    for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) if (occ[j * grid + i]) return false;
    return true;
  };
  for (const t of txs) {
    const s = side(t.vsize);
    place: for (let y = low; y + s <= grid; y++)
      for (let x = first[y]; x + s <= grid; x++) {
        if (occ[y * grid + x] || !free(x, y, s)) continue;
        for (let j = y; j < y + s; j++) {
          for (let i = x; i < x + s; i++) occ[j * grid + i] = 1;
          while (first[j] < grid && occ[j * grid + first[j]]) first[j]++;
        }
        out.push({ id: t.id, x, y, s, rate: t.rate, vsize: t.vsize, fee: t.fee });
        break place;
      }
    while (low < grid && first[low] >= grid) low++;
  }
  out.unit = unit;
  return out;
}
// Add transactions to a block already drawn, without moving anything: each goes into the lowest free spot (highest fee
// rates placed first), at the cell size of the last full layout. Returns the new squares and the ones that did not fit.
export function fitInto(placed, adds, grid, unit) {
  const occ = new Uint8Array(grid * grid),
    out = [],
    left = [];
  for (const p of placed)
    for (let j = p.y; j < Math.min(grid, p.y + p.s); j++)
      for (let i = p.x; i < Math.min(grid, p.x + p.s); i++) occ[j * grid + i] = 1;
  const free = (x, y, s) => {
    for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) if (occ[j * grid + i]) return false;
    return true;
  };
  for (const t of adds.filter((a) => a.vsize > 0).sort((a, b) => b.rate - a.rate)) {
    const s = Math.max(1, Math.min(grid, Math.round(Math.sqrt(t.vsize / unit))));
    let done = false,
      y0 = grid;
    for (const p of placed) if (p.rate <= t.rate && p.y < y0) y0 = p.y; // start where its fee band starts, so colours stay in order
    if (y0 >= grid) y0 = 0;
    place: for (let n = 0; n + s <= grid; n++)
      for (let x = 0, y = (y0 + n) % (grid - s + 1); x + s <= grid; x++) {
        if (occ[y * grid + x] || !free(x, y, s)) continue;
        for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) occ[j * grid + i] = 1;
        out.push({
          id: t.id,
          x,
          y,
          s,
          rate: t.rate,
          vsize: t.vsize,
          fee: t.fee,
          misplaced: y < y0 || y > y0 + Math.max(3, s * 2),
        });
        done = true;
        break place;
      }
    if (!done) left.push(t);
  }
  return { placed: out, left };
}
// Without the live feed: a stand-in block with the projected block's count, size and fee spread (marked approximate).
export function approxBlock(pb, seed = 1) {
  if (!pb || !(pb.nTx > 0)) return [];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const n = Math.min(pb.nTx, 5000),
    fr = (pb.feeRange || []).filter(Number.isFinite),
    avg = (pb.blockVSize || 0) / pb.nTx || 250,
    out = [];
  const rateAt = (q) => {
    if (!fr.length) return pb.medianFee || 1;
    const p = q * (fr.length - 1),
      i = Math.floor(p),
      k = p - i;
    return fr[i] + ((fr[i + 1] ?? fr[i]) - fr[i]) * k;
  };
  for (let i = 0; i < n; i++) {
    const v = avg * Math.exp((rnd() + rnd() + rnd() - 1.5) * 1.1) * (pb.nTx / n);
    out.push({ id: 'approx-' + i, fee: 0, vsize: v, rate: rateAt(rnd()) });
  }
  return out;
}
// mempool.space /v1/mining/reward-stats/144 (+ the current hashrate in H/s) -> what miners earned over the last 144 blocks
// (about a day): total revenue, the share that came from fees, the average per block and the hashprice (sats per PH/s per day).
export function minerEconomics(r, hashrate) {
  if (!r) return null;
  const reward = Number(r.totalReward),
    fee = Number(r.totalFee),
    n = Number(r.endBlock) - Number(r.startBlock) + 1,
    tx = Number(r.totalTx);
  if (!(reward > 0) || !(n > 0)) return null;
  return {
    blocks: n,
    reward,
    fee,
    tx,
    feeShare: fee / reward,
    perBlock: reward / n,
    hashprice: hashrate > 0 ? (reward * (144 / n)) / (hashrate / 1e15) : NaN,
  }; // scaled to 144 blocks so a short window still reads per day
}
// Blocks on screen + a fresh list -> one list, newest first, one entry per height (the fresh copy wins), at most 15.
export function mergeBlocks(cur, fresh) {
  const by = new Map();
  for (const b of [...(cur || []), ...(fresh || [])]) if (b && Number.isFinite(b.height)) by.set(b.height, b);
  return [...by.values()].sort((a, b) => b.height - a.height).slice(0, 15);
}

// ---- watched addresses (on a node only) ----
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Ok(s) {
  // the checksum of a bech32 (version 0) or bech32m (version 1+) address, so a typo is caught before it is watched
  const i = s.lastIndexOf('1'),
    hrp = s.slice(0, i),
    data = [...s.slice(i + 1)].map((c) => B32.indexOf(c));
  if (i < 1 || data.length < 7 || data.some((d) => d < 0)) return false;
  let chk = 1;
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const step = (v) => {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let k = 0; k < 5; k++) if ((b >>> k) & 1) chk ^= G[k];
  };
  for (const c of hrp) step(c.charCodeAt(0) >> 5);
  step(0);
  for (const c of hrp) step(c.charCodeAt(0) & 31);
  for (const d of data) step(d);
  const want = data[0] === 0 ? 1 : 0x2bc830a3;
  return chk >>> 0 === want;
}
// A Bitcoin address as typed -> the address to watch ('' if it is not one). Mainnet, testnet, signet and regtest shapes:
// legacy (1…, 3…, m…, n…, 2…) by their shape, and bech32 (bc1…, tb1…, bcrt1…) with its checksum.
export function normAddress(s) {
  s = String(s || '').trim();
  if (/^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return s;
  const l = s.toLowerCase();
  if (s !== l && s !== s.toUpperCase()) return ''; // bech32 is all one case
  if (/^(bc|tb|bcrt)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{8,87}$/.test(l) && bech32Ok(l)) return l;
  return '';
}
export const shortAddr = (a) => (a.length > 16 ? a.slice(0, 8) + '…' + a.slice(-6) : a);
// What a transaction (mempool.space /api/address/:a/txs shape) pays an address, net of what it spends from it, in sats.
export function addrReceived(tx, addr) {
  let n = 0;
  for (const o of (tx && tx.vout) || []) if (o && o.scriptpubkey_address === addr) n += o.value || 0;
  for (const i of (tx && tx.vin) || [])
    if (i && i.prevout && i.prevout.scriptpubkey_address === addr) n -= i.prevout.value || 0;
  return n;
}
// The payments to an address since it was last checked. `seen` maps txid -> 'm' (waiting) or 'c' (confirmed); null
// means never checked, which only records what is there now. Returns the new `seen` and the events to report: 'in' for
// a payment first seen while it waits, 'conf' once it is in a block (also for one first seen already confirmed).
export function addrEvents(seen, txs, addr) {
  const next = {},
    events = [];
  for (const tx of txs || []) {
    if (!tx || typeof tx.txid !== 'string') continue;
    const sats = addrReceived(tx, addr);
    if (sats <= 0) continue; // a payment from this address, or change back to it
    const conf = !!(tx.status && tx.status.confirmed);
    next[tx.txid] = conf ? 'c' : 'm';
    if (!seen) continue;
    const was = seen[tx.txid];
    if (!was)
      events.push({ kind: conf ? 'conf' : 'in', txid: tx.txid, sats, height: conf ? tx.status.block_height : 0 });
    else if (was === 'm' && conf) events.push({ kind: 'conf', txid: tx.txid, sats, height: tx.status.block_height });
  }
  return { seen: next, events };
}
// mempool.space /api/address/:a -> the address page's summary, in sats: balance (confirmed), what is waiting to confirm
// (in minus out, can be negative), everything ever received, and the number of transactions.
export function parseAddress(x) {
  const c = (x && x.chain_stats) || {},
    m = (x && x.mempool_stats) || {},
    n = (v) => (Number.isFinite(v) ? v : 0);
  return {
    balance: n(c.funded_txo_sum) - n(c.spent_txo_sum),
    pending: n(m.funded_txo_sum) - n(m.spent_txo_sum),
    received: n(c.funded_txo_sum),
    txs: n(c.tx_count) + n(m.tx_count),
  };
}
// Satoshis -> a BTC amount without trailing zeros (12345000 -> "0.12345").
export function fmtBtc(sats, loc) {
  const d = (Math.abs(sats) / 1e8).toFixed(8).replace(/0+$/, '').split('.')[1] || '';
  return fmtNum(sats / 1e8, d.length, loc);
}

// ---- Mempool history by fee rate (mempool.space /api/v1/statistics/{range}; the backup server has no such call) ----
// Each record has `added` (unix seconds) and `vsizes`: vsizes[i] is the vbytes waiting at FEE_BREAKS[i] up to
// FEE_BREAKS[i + 1] sat/vB (the last band: 2000 and more). -> ascending [{ t (ms), v (total vB), b (vB per band) }].
// With `from` > 0 the lowest bands are left out of the total (and of the drawing, see bandLayers); b keeps them all.
export function mempoolHistory(raw, from = 0) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && Number.isFinite(r.added) && Array.isArray(r.vsizes))
    .map((r) => {
      const b = FEE_BREAKS.map((_, i) => Math.max(0, Number(r.vsizes[i]) || 0));
      return { t: r.added * 1000, v: b.reduce((a, x, i) => (i >= from ? a + x : a), 0), b };
    })
    .sort((a, c) => a.t - c.t);
}
// The band where the next block would end if it were filled from the highest fee rates down (`room` vB, a full block):
// paying above it gets in, inside it maybe. -1 when everything waiting fits.
export function nextBlockBand(b, room = 1e6) {
  let sum = 0;
  for (let i = (b || []).length - 1; i >= 0; i--) {
    sum += b[i];
    if (sum >= room) return i;
  }
  return -1;
}
// For drawing stacked areas: the bands that hold anything, lowest fee first, each with the running total at every point
// (its top edge; the band below's top is its bottom edge).
export function bandLayers(pts, from = 0) {
  const used = FEE_BREAKS.map((_, i) => i).filter((i) => i >= from && pts.some((p) => p.b[i] > 0)),
    run = pts.map(() => 0);
  return used.map((i) => ({ band: i, top: pts.map((p, k) => (run[k] += p.b[i])) }));
}
// Share (0-100) of the points whose value is above v: how often the mempool was fuller than it is now.
export function shareAbove(pts, v) {
  if (!pts.length) return NaN;
  return (pts.filter((p) => p.v > v).length / pts.length) * 100;
}

// ---- Mining page: pool ranking and past difficulty adjustments ----
// /v1/mining/pools/{range} -> every pool that found a block, largest first: its share of the blocks, an estimate of its
// hashrate (that share of the network's) and its empty blocks; plus how few of the largest pools found more than half.
export function poolRanking(resp) {
  const ps = ((resp && resp.pools) || [])
      .filter((p) => p && p.blockCount > 0)
      .sort((a, b) => b.blockCount - a.blockCount),
    total = ps.reduce((s, p) => s + p.blockCount, 0),
    hr = resp && resp.lastEstimatedHashrate;
  if (!total) return null;
  let run = 0,
    half = 0;
  const rows = ps.map((p, i) => {
    run += p.blockCount;
    if (!half && run * 2 > total) half = i + 1;
    const share = p.blockCount / total;
    return {
      rank: i + 1,
      name: p.name,
      blocks: p.blockCount,
      share,
      empty: p.emptyBlocks || 0,
      hashrate: hr > 0 ? share * hr : NaN,
    };
  });
  return { total, rows, half };
}
// /v1/mining/difficulty-adjustments: [[time (s), height, difficulty, new/old ratio]], newest first ->
// [{ t (ms), height, diff, change (%) }], newest first, without the genesis block's entry (ratio 0).
export function diffAdjustments(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => Array.isArray(r) && r[1] > 0 && r[3] > 0)
    .map((r) => ({ t: r[0] * 1000, height: r[1], diff: r[2], change: (r[3] - 1) * 100 }))
    .sort((a, b) => b.height - a.height);
}
// The adjustments since `from` (ms): how many, how many went up and down, and the largest rise and drop (in %).
export function adjustSummary(rows, from) {
  const xs = rows.filter((r) => r.t >= from);
  if (!xs.length) return null;
  const ch = xs.map((r) => r.change);
  return {
    n: xs.length,
    up: ch.filter((c) => c > 0).length,
    down: ch.filter((c) => c < 0).length,
    maxUp: Math.max(...ch),
    maxDown: Math.min(...ch),
  };
}

// When the Lightning statistics were taken (mempool.space /v1/lightning/statistics/latest has `added`, an ISO date or
// unix seconds): ms, or NaN. They are shown with their date once they are more than LN_STALE_DAYS old.
export const LN_STALE_DAYS = 7;
export function lnTakenAt(l) {
  const a = l && l.added;
  const ms = typeof a === 'number' ? a * 1000 : Date.parse(a);
  return Number.isFinite(ms) ? ms : NaN;
}
export const lnStale = (l, now = Date.now()) => now - lnTakenAt(l) > LN_STALE_DAYS * 864e5;
// ---- Sending a signed transaction: it is read on the device first, so the person sees what they are about to send ----
// SHA-256 (FIPS 180-4), synchronous, for the transaction ID and legacy address checksums.
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);
export function sha256(bytes) {
  const n = bytes.length,
    len = Math.ceil((n + 9) / 64) * 64,
    m = new Uint8Array(len);
  m.set(bytes);
  m[n] = 0x80;
  const bits = n * 8;
  m[len - 4] = bits >>> 24;
  m[len - 3] = bits >>> 16;
  m[len - 2] = bits >>> 8;
  m[len - 1] = bits;
  m[len - 5] = Math.floor(bits / 2 ** 32);
  const h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]),
    w = new Uint32Array(64),
    r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++)
      w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15],
        b = w[i - 2];
      w[i] = w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0,
        t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = h[i] >>> 24;
    out[i * 4 + 1] = h[i] >>> 16;
    out[i * 4 + 2] = h[i] >>> 8;
    out[i * 4 + 3] = h[i];
  }
  return out;
}
export const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (s) => Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16));
// Mainnet addresses from an output script: base58check for legacy (P2PKH 1…, P2SH 3…), bech32 for SegWit v0 (bc1q…)
// and bech32m for v1 and up (Taproot, bc1p…).
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58check(version, payload) {
  const b = Uint8Array.from([version, ...payload]),
    all = Uint8Array.from([...b, ...sha256(sha256(b)).slice(0, 4)]);
  let n = BigInt('0x' + toHex(all)),
    s = '';
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const x of all) {
    if (x) break;
    s = '1' + s;
  }
  return s;
}
function bech32Encode(hrp, ver, prog) {
  const data = [ver],
    G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let acc = 0,
    bits = 0;
  for (const x of prog) {
    acc = (acc << 8) | x;
    bits += 8;
    while (bits >= 5) data.push((acc >>> (bits -= 5)) & 31);
  }
  if (bits) data.push((acc << (5 - bits)) & 31);
  let chk = 1;
  const step = (v) => {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let k = 0; k < 5; k++) if ((top >>> k) & 1) chk ^= G[k];
  };
  for (const c of hrp) step(c.charCodeAt(0) >> 5);
  step(0);
  for (const c of hrp) step(c.charCodeAt(0) & 31);
  for (const d of data) step(d);
  for (let i = 0; i < 6; i++) step(0);
  chk ^= ver === 0 ? 1 : 0x2bc830a3;
  const sum = [0, 1, 2, 3, 4, 5].map((i) => (chk >>> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...sum].map((d) => B32[d]).join('');
}
// An output script (bytes) -> { type, address } (address '' for data and unknown scripts). Types are named as
// mempool.space names them, so a transaction read here and one fetched from the server look the same.
export function scriptInfo(s) {
  const h = toHex(s);
  if (s.length === 25 && /^76a914[0-9a-f]{40}88ac$/.test(h))
    return { type: 'p2pkh', address: base58check(0, s.slice(3, 23)) };
  if (s.length === 23 && /^a914[0-9a-f]{40}87$/.test(h))
    return { type: 'p2sh', address: base58check(5, s.slice(2, 22)) };
  if (s.length === 22 && h.startsWith('0014')) return { type: 'v0_p2wpkh', address: bech32Encode('bc', 0, s.slice(2)) };
  if (s.length === 34 && h.startsWith('0020')) return { type: 'v0_p2wsh', address: bech32Encode('bc', 0, s.slice(2)) };
  if (s.length === 34 && h.startsWith('5120')) return { type: 'v1_p2tr', address: bech32Encode('bc', 1, s.slice(2)) };
  if (s[0] === 0x6a) return { type: 'op_return', address: '' };
  return { type: 'unknown', address: '' };
}
// Raw transaction hex (as a wallet exports it) -> what it does, read on the device: { txid, version, segwit, size,
// weight, vsize, locktime, rbf, vin: [{ txid, vout, sequence }], vout: [{ value (sats), type, address }] }.
// Not a transaction -> { error: 'hex' | 'parse' }. Signatures are not checked: the network does that when it is sent.
export function parseRawTx(hex) {
  const s = String(hex || '').replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 || s.length < 120) return { error: 'hex' };
  const b = fromHex(s.toLowerCase());
  let p = 0;
  const need = (n) => {
    if (p + n > b.length) throw new Error('short');
  };
  const u32 = () => {
    need(4);
    const v = (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 2 ** 24;
    p += 4;
    return v;
  };
  const varint = () => {
    need(1);
    const f = b[p++];
    if (f < 0xfd) return f;
    const k = f === 0xfd ? 2 : f === 0xfe ? 4 : 8;
    need(k);
    let v = 0;
    for (let i = k - 1; i >= 0; i--) v = v * 256 + b[p + i];
    p += k;
    return v;
  };
  const take = (n) => {
    need(n);
    p += n;
    return b.subarray(p - n, p);
  };
  try {
    const version = u32();
    const segwit = b[p] === 0 && b[p + 1] === 1;
    if (segwit) p += 2;
    const bodyStart = p,
      nin = varint();
    if (!nin || nin > 100000) throw new Error('inputs');
    const vin = [];
    for (let i = 0; i < nin; i++) {
      const prev = toHex(take(32).slice().reverse()),
        vout = u32();
      take(varint());
      vin.push({ txid: prev, vout, sequence: u32() });
    }
    const nout = varint();
    if (!nout || nout > 100000) throw new Error('outputs');
    const vout = [];
    for (let i = 0; i < nout; i++) {
      need(8);
      let v = 0;
      for (let k = 7; k >= 0; k--) v = v * 256 + b[p + k];
      p += 8;
      vout.push(Object.assign({ value: v }, scriptInfo(take(varint()))));
    }
    const bodyEnd = p;
    if (segwit) for (let i = 0; i < nin; i++) for (let k = varint(); k > 0; k--) take(varint());
    const lockAt = p,
      locktime = u32();
    if (p !== b.length) throw new Error('trailing');
    const base = Uint8Array.from([...b.subarray(0, 4), ...b.subarray(bodyStart, bodyEnd), ...b.subarray(lockAt)]),
      weight = base.length * 3 + b.length;
    return {
      txid: toHex(sha256(sha256(base)).reverse()),
      version,
      segwit,
      size: b.length,
      weight,
      vsize: Math.ceil(weight / 4),
      locktime,
      rbf: vin.some((x) => x.sequence < 0xfffffffe),
      vin,
      vout,
    };
  } catch {
    return { error: 'parse' };
  }
}
// The fee, once the coins each input spends are known (prev: Map 'txid:vout' -> sats). NaN while one is missing.
export function txFee(tx, prev) {
  let sin = 0;
  for (const x of tx.vin) {
    const v = prev.get(x.txid + ':' + x.vout);
    if (!Number.isFinite(v)) return NaN;
    sin += v;
  }
  return sin - tx.vout.reduce((a, o) => a + o.value, 0);
}
// A transaction read here, in mempool.space's shape (for the input/output lists and privacy hints of the transaction
// page), with each input's coins filled in from the transactions they came from (prevTx: Map txid -> server answer).
export function asServerTx(tx, prevTx = new Map()) {
  return {
    vin: tx.vin.map((i) => {
      const p = prevTx.get(i.txid),
        o = p && p.vout && p.vout[i.vout];
      return { txid: i.txid, vout: i.vout, prevout: o || null };
    }),
    vout: tx.vout.map((o) => ({
      value: o.value,
      scriptpubkey_type: o.type,
      scriptpubkey_address: o.address || undefined,
    })),
  };
}

// ---- Price and supply facts (the Charts page's long-term section) ----
// The all-time high of a price series (ascending [{ t, v }], daily or weekly closes) and the live price, if that is
// higher: { ath, at (ms), below (% under the high, 0 at it), days (since the high), now (true when the live price is it) }.
export function athFacts(pts, live, nowMs = Date.now()) {
  let ath = NaN,
    at = NaN;
  for (const p of pts || []) if (!(p.v <= ath)) [ath, at] = [p.v, p.t];
  const cur = Number.isFinite(live) && live > 0 ? live : pts && pts.length ? pts[pts.length - 1].v : NaN;
  if (!Number.isFinite(ath) && !Number.isFinite(cur)) return null;
  if (!(cur < ath)) return { ath: cur, at: nowMs, below: 0, days: 0, now: true };
  return { ath, at, below: (1 - cur / ath) * 100, days: Math.floor((nowMs - at) / 864e5), now: false };
}
// Yearly inflation of the supply at a height: the coins the next 52,560 blocks (a year at 10 minutes) add, as a % of
// those issued so far. A halving inside that year is counted.
export const BLOCKS_YEAR = 52560;
export function inflationAt(h) {
  if (!(h >= 0)) return NaN;
  const s = supplyAt(h);
  return s > 0 ? ((supplyAt(h + BLOCKS_YEAR) - s) / s) * 100 : NaN;
// ---- Block health: how closely a mined block matched the block mempool.space expected from its own mempool ----
// From the block (extras.matchRate, expectedFees) and, when there is one, its audit summary (lists of txids):
// { match (%), fees, expected (sats), missing (expected but left out), added (in it but not expected), fresh (of
// those, seen only moments before) } or null when the block was not compared (older blocks, the backup server).
export function blockHealth(block, audit) {
  const x = (block && block.extras) || {},
    a = audit && typeof audit === 'object' ? audit : null,
    n = (k) => (a && Array.isArray(a[k]) ? a[k].length : NaN),
    match = a && Number.isFinite(a.matchRate) ? a.matchRate : x.matchRate;
  if (!Number.isFinite(match)) return null;
  return {
    match,
    fees: x.totalFees,
    expected: a && Number.isFinite(a.expectedFees) ? a.expectedFees : x.expectedFees,
    missing: n('missingTxs'),
    added: n('addedTxs'),
    fresh: n('freshTxs'),
  };
}
