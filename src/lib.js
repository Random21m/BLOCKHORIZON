// BLOCKHORIZON pure helpers: no DOM, no network. Unit-tested in tests/lib.test.mjs.
export const EPOCH = 210000;
export const TARGET_SEC = 600;
export const MAX_SATS = 2100000000000000;
export const HALVINGS = [ // known past halving dates (UTC ms) by epoch index
  Date.UTC(2009, 0, 3), Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)];

export function subsidy(h) {
  const e = Math.floor(h / EPOCH);
  return e >= 64 ? 0 : Math.floor(5000000000 / 2 ** e);
}
export function supplyAt(h) { // sats issued by blocks 0..h inclusive
  let s = 0, n = h + 1, e = 0;
  while (n > 0 && e < 64) { const c = Math.min(n, EPOCH); s += c * Math.floor(5000000000 / 2 ** e); n -= c; e++; }
  return s;
}
export function halvingInfo(h, nowMs = Date.now()) {
  const epoch = Math.floor(h / EPOCH), next = (epoch + 1) * EPOCH, togo = next - h;
  return { epoch, nextHeight: next, blocksToGo: togo, progress: (h - epoch * EPOCH) / EPOCH,
    subsidy: subsidy(h), nextSubsidy: subsidy(next), estMs: nowMs + togo * TARGET_SEC * 1000 };
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
  let i = 0; while (h >= 1000 && i < u.length - 1) { h /= 1000; i++; }
  return h.toFixed(h >= 100 ? 0 : 2) + ' ' + u[i];
}
export function fmtDifficulty(d) {
  if (!Number.isFinite(d)) return '–';
  const u = ['', 'K', 'M', 'G', 'T', 'P'];
  let i = 0; while (d >= 1000 && i < u.length - 1) { d /= 1000; i++; }
  return d.toFixed(2) + ' ' + u[i];
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
export function fmtAgo(sec) {
  if (sec < 90) return `${Math.max(0, Math.round(sec))}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}
export function fmtFee(v) { return Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : v < 1000 ? String(Math.round(v)) : fmtNum(Math.round(v))) : '–'; }
export function satsToBtc(s, d = 8) { return (s / 1e8).toFixed(d); }
export function satsPerUnit(price) { return price > 0 ? Math.floor(1e8 / price) : NaN; }
export function fmtDate(ms, o = {}) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  const utc = o.utc, Y = utc ? d.getUTCFullYear() : d.getFullYear(), M = (utc ? d.getUTCMonth() : d.getMonth()) + 1, D = utc ? d.getUTCDate() : d.getDate();
  let hh = utc ? d.getUTCHours() : d.getHours(); const mm = utc ? d.getUTCMinutes() : d.getMinutes(); let suf = '';
  if (o.h12) { suf = hh >= 12 ? ' PM' : ' AM'; hh = hh % 12 || 12; }
  const date = o.dateFmt === 'dmy' ? `${p(D)}.${p(M)}.${Y}` : o.dateFmt === 'mdy' ? `${p(M)}/${p(D)}/${Y}` : `${Y}-${p(M)}-${p(D)}`;
  return o.dateOnly ? date : `${date} ${o.h12 ? hh : p(hh)}:${p(mm)}${suf}`;
}

// Hashrate series from mempool.space /v1/mining/hashrate/*: {hashrates:[{timestamp,avgHashrate}], currentHashrate}
export function hashrateAverages(series, current) {
  const pts = (series || []).filter((p) => Number.isFinite(p.avgHashrate)).sort((a, b) => a.timestamp - b.timestamp);
  const avg = (n) => { const s = pts.slice(-n); return s.length ? s.reduce((a, p) => a + p.avgHashrate, 0) / s.length : NaN; };
  return { current: Number.isFinite(current) ? current : (pts.length ? pts[pts.length - 1].avgHashrate : NaN),
    d7: avg(7), d14: avg(14), d30: avg(30), d90: avg(90) };
}
// Block time stats from newest-first blocks array
export function blockTimeStats(blocks, nowSec = Date.now() / 1000) {
  const b = (blocks || []).slice().sort((x, y) => y.height - x.height);
  if (b.length < 2) return { avg: NaN, fast: 0, slow: 0, count: b.length, since: b[0] ? nowSec - b[0].timestamp : NaN };
  const gaps = []; for (let i = 0; i < b.length - 1; i++) gaps.push(b[i].timestamp - b[i + 1].timestamp);
  return { avg: gaps.reduce((a, g) => a + g, 0) / gaps.length, fast: gaps.filter((g) => g < TARGET_SEC).length,
    slow: gaps.filter((g) => g >= TARGET_SEC).length, count: b.length, since: nowSec - b[0].timestamp };
}
export function parseDifficulty(d) {
  return { progress: d.progressPercent / 100, change: d.difficultyChange, blocksLeft: d.remainingBlocks, estMs: d.estimatedRetargetDate,
    prevChange: d.previousRetarget, prevTimeSec: d.previousTime, nextHeight: d.nextRetargetHeight };
}
export function parseBlock(b) {
  const x = b.extras || {};
  return { id: b.id, height: b.height, ts: b.timestamp, txs: b.tx_count, size: b.size, weight: b.weight,
    reward: x.reward, fees: Number.isFinite(x.totalFees) ? x.totalFees : (x.reward ? x.reward - subsidy(b.height) : NaN),
    medianFee: x.medianFee, feeRange: x.feeRange || [], pool: x.pool ? x.pool.name : '', empty: b.tx_count <= 1 };
}
export function mempoolDepth(info) { return info && info.vsize ? info.vsize / 1e6 : NaN; }
export function parseTipHeight(text) { const n = parseInt(String(text).trim(), 10); return Number.isInteger(n) && n >= 0 ? n : NaN; }
export function parseHeightInput(s) {
  const t = String(s).trim().replace(/[,_\s']/g, ''); if (!/^\d{1,7}$/.test(t)) return NaN; return parseInt(t, 10);
}
// Moscow time "HH:MM" style: sats per dollar shown as clock
export function moscowTime(sats) { const s = String(Math.max(0, Math.min(9999, Math.floor(sats)))).padStart(4, '0'); return s.slice(0, 2) + ':' + s.slice(2); }
export function marketCapUsd(h, price) { return supplyAt(h) / 1e8 * price; }
export function compact(n) {
  const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, s] of u) if (Math.abs(n) >= v) return (n / v).toFixed(2) + s; return String(Math.round(n));
}

// Block colours follow the mempool.space convention so the two read the same: fee-rate colour ramp for upcoming blocks,
// purple-to-blue for mined blocks. (Colour values only; drawn in our own flat style.)
export const FEE_BREAKS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000];
export const FEE_COLORS = ['007d3d', '557d00', '5d7d01', '637d02', '6d7d04', '757d05', '7d7d06', '867d08', '8c7d09', '957d0b', '9b7d0c', 'a67d0e', 'aa7d0f', 'b27d10', 'bb7d11', 'bf7d12', 'bf7815', 'bf7319', 'be6c1e', 'be6820', 'bd6125', 'bd5c28', 'bc552d', 'bc4f30', 'bc4a34', 'bb4339', 'bb3d3c', 'bb373f', 'ba3243', 'b92b48', 'b9254b', 'b8214d', 'b71d4f', 'b61951', 'b41453', 'b30e55', 'b10857', 'b00259', 'ae005b'];
export const MINED_TOP = '#9339f4', MINED_BOTTOM = '#105fb0', MINED_EMPTY = '#2d3348', UPCOMING_EMPTY = '#554b45';
export function feeColor(fee) {
  let idx = 0; for (let i = 0; i < FEE_BREAKS.length; i++) if (fee >= FEE_BREAKS[i]) idx = i;
  return '#' + FEE_COLORS[idx];
}
// CSS background for an upcoming block: hard-edged vertical stripes, one per fee-range value (low to high, left to right)
export function feeStripes(feeRange) {
  const cols = (feeRange || []).filter(Number.isFinite).map(feeColor).filter((c, i, a) => i === 0 || c !== a[i - 1]);
  if (!cols.length) return UPCOMING_EMPTY;
  const n = cols.length; if (n === 1) return cols[0];
  return 'linear-gradient(to right, ' + cols.map((c, i) => `${c} ${(i / n * 100).toFixed(1)}% ${((i + 1) / n * 100).toFixed(1)}%`).join(', ') + ')';
}

// ---- transactions ----
export function isTxid(s) { return /^[0-9a-f]{64}$/i.test(String(s).trim()); }
// mempool.space /api/tx/:txid -> what the transaction page shows. Confirmations need the current tip height.
export function parseTx(x, tip) {
  const s = x.status || {}, vsize = Math.ceil((x.weight || 0) / 4);
  const out = (x.vout || []).reduce((a, o) => a + (o.value || 0), 0), coinbase = !!(x.vin && x.vin[0] && x.vin[0].is_coinbase);
  return { id: x.txid, confirmed: !!s.confirmed, height: s.block_height, time: s.block_time,
    confs: s.confirmed && Number.isFinite(tip) && tip >= s.block_height ? tip - s.block_height + 1 : s.confirmed ? 1 : 0,
    fee: x.fee || 0, vsize, feeRate: vsize ? (x.fee || 0) / vsize : NaN, ins: (x.vin || []).length, outs: (x.vout || []).length, valueOut: out, coinbase };
}
// Which projected block an unconfirmed fee rate falls into (0 = the next block), or -1 if below every projected block.
export function txQueuePos(feeRate, projected) {
  const p = projected || [];
  for (let i = 0; i < p.length; i++) { const lo = (p[i].feeRange && p[i].feeRange.length) ? p[i].feeRange[0] : p[i].medianFee; if (feeRate >= lo) return i; }
  return -1;
}
// Approximate virtual size of a payment (vB) for the common address types: inputs, outputs and the fixed overhead.
export const TX_SIZES = { segwit: { base: 10.5, in: 68, out: 31 }, taproot: { base: 10.5, in: 57.5, out: 43 }, legacy: { base: 10, in: 148, out: 34 } };
export function txVsize(ins, outs, type = 'segwit') {
  const s = TX_SIZES[type] || TX_SIZES.segwit, i = Math.max(1, Math.floor(ins) || 1), o = Math.max(1, Math.floor(outs) || 1);
  return Math.ceil(s.base + i * s.in + o * s.out);
}

// ---- fee alerts ----
// Which mempool.space /v1/fees/recommended field each alert speed watches.
export const FEE_LEVELS = { next: 'fastestFee', h30: 'halfHourFee', h1: 'hourFee' };
// Alerts whose fee level is now at or below their limit vs still waiting. Missing fee data reaches nothing.
export function splitFeeAlerts(list, fees) {
  const all = Array.isArray(list) ? list : [], now = (a) => (fees ? fees[FEE_LEVELS[a.level] || FEE_LEVELS.next] : NaN);
  const hit = all.filter((a) => Number.isFinite(now(a)) && now(a) <= a.max);
  return { hit, rest: all.filter((a) => !hit.includes(a)) };
}
export function parseFeeLimit(s) { const v = parseFloat(String(s).trim().replace(',', '.')); return Number.isFinite(v) && v > 0 && v < 100000 ? v : NaN; }

// ---- history charts ----
// mempool.space responses -> ascending [{ t: ms, v }] series. Missing or unavailable values (the API uses -1) are dropped.
const asc = (pts) => pts.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.t - b.t);
export const SERIES = {
  price: (r, cur) => asc(((r && r.prices) || []).map((p) => ({ t: p.time * 1000, v: p[cur] }))),
  hashrate: (r) => asc(((r && r.hashrates) || []).map((p) => ({ t: p.timestamp * 1000, v: p.avgHashrate }))),
  difficulty: (r) => asc(((r && r.difficulty) || []).map((p) => ({ t: p.time * 1000, v: p.difficulty }))),
  // Median fee rate per group of blocks. Often 0 in quiet times: a real value, so kept (unlike missing prices).
  fees: (r) => (Array.isArray(r) ? r : []).map((p) => ({ t: p.timestamp * 1000, v: p.avgFee_50 })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v >= 0).sort((a, b) => a.t - b.t),
};
export const RANGES = { '1m': 30 * 864e5, '1y': 365 * 864e5, all: Infinity };
export function inRange(pts, range, now = Date.now()) { const span = RANGES[range] || Infinity; return span === Infinity ? pts : pts.filter((p) => p.t >= now - span); }
// At most n points, evenly spread by index, always keeping the first and the last.
export function thin(pts, n = 400) {
  if (pts.length <= n) return pts;
  const out = []; for (let i = 0; i < n; i++) out.push(pts[Math.round(i * (pts.length - 1) / (n - 1))]); return out;
}
// Axis ticks. Linear: 1/2/5 x 10^k steps covering [lo, hi]. Log: powers of ten inside the range (with 2 and 5 between when few).
export function ticks(lo, hi, log, count = 4) {
  if (!(hi > lo)) return [lo];
  if (log) {
    const out = [], a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
    for (let e = a; e <= b; e++) for (const m of b - a <= 2 ? [1, 2, 5] : [1]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(v); }
    return out.length ? out : [lo, hi];
  }
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((m) => m * mag).reduce((a, s) => (Math.abs(Math.log(s / raw)) < Math.abs(Math.log(a / raw)) ? s : a)); // the 1/2/5 step nearest the ideal
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12)); return out;
}
// Index of the point nearest to time t (points ascending).
export function nearest(pts, t) {
  let lo = 0, hi = pts.length - 1; if (hi < 0) return -1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t < t) lo = m; else hi = m; }
  return Math.abs(pts[lo].t - t) <= Math.abs(pts[hi].t - t) ? lo : hi;
}
// Trailing mean over the last `days` days at each point (ascending series). days <= 0 returns the series unchanged.
export function smoothDays(pts, days) {
  if (!(days > 0)) return pts;
  const w = days * 864e5, out = []; let j = 0, sum = 0;
  for (let i = 0; i < pts.length; i++) { sum += pts[i].v; while (pts[i].t - pts[j].t >= w) sum -= pts[j++].v; out.push({ t: pts[i].t, v: sum / (i - j + 1) }); }
  return out;
}
