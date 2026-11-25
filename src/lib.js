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
  let hh = utc ? d.getUTCHours() : d.getHours(); const mm = utc ? d.getUTCMinutes() : d.getMinutes(), ss = utc ? d.getUTCSeconds() : d.getSeconds(); let suf = '';
  if (o.h12) { suf = hh >= 12 ? ' PM' : ' AM'; hh = hh % 12 || 12; }
  const date = o.dateFmt === 'dmy' ? `${p(D)}.${p(M)}.${Y}` : o.dateFmt === 'mdy' ? `${p(M)}/${p(D)}/${Y}` : `${Y}-${p(M)}-${p(D)}`;
  const time = `${o.h12 ? hh : p(hh)}:${p(mm)}${o.sec ? ':' + p(ss) : ''}${suf}`; // o.sec adds seconds, o.timeOnly drops the date (the live chart)
  return o.dateOnly ? date : o.timeOnly ? time : `${date} ${time}`;
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
// Axis labels: drop trailing zeros after the decimal point ("100.00K" -> "100K", "92.50 T" -> "92.5 T").
export const trimZeros = (s) => String(s).replace(/(\d)\.(\d*?)0+(?!\d)/g, (m, a, b) => a + (b ? '.' + b : ''));
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
// ---- Trading chart (Kraken candles) ----
// Timeframes: key -> minutes (Kraken's own intervals, for both REST and websocket).
export const TIMEFRAMES = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440, '1W': 10080 };
// Kraken's REST pair names (it calls bitcoin XBT).
export const krakenPair = (cur) => 'XBT' + cur;
const candle = (t, o, h, l, c, v) => ({ t, o, h, l, c, v });
const okCandle = (k) => Number.isFinite(k.t) && [k.o, k.h, k.l, k.c].every((x) => Number.isFinite(x) && x > 0) && Number.isFinite(k.v);
// Pure: Kraken REST /0/public/OHLC JSON -> candles ascending ({t: open time ms, o, h, l, c, v}). Rows: [time, o, h, l, c, vwap, volume, count].
export function parseKrakenRest(r) {
  if (!r || (Array.isArray(r.error) && r.error.length) || !r.result) return [];
  const k = Object.keys(r.result).find((x) => x !== 'last' && Array.isArray(r.result[x])); if (!k) return [];
  return r.result[k].map((x) => candle(x[0] * 1000, +x[1], +x[2], +x[3], +x[4], +x[6])).filter(okCandle).sort((a, b) => a.t - b.t);
}
// Pure: Kraken v2 websocket text -> { type: 'snapshot'|'update', cur, interval, candles } for BTC ohlc frames, else null.
export function parseOhlc(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || m.channel !== 'ohlc' || (m.type !== 'snapshot' && m.type !== 'update') || !Array.isArray(m.data)) return null;
    let cur = '', interval = 0;
    const candles = m.data.filter((d) => d && /^BTC\/[A-Z]{3}$/.test(d.symbol)).map((d) => { cur = d.symbol.slice(4); interval = d.interval; return candle(Date.parse(d.interval_begin), d.open, d.high, d.low, d.close, d.volume); })
      .filter(okCandle).sort((a, b) => a.t - b.t);
    return candles.length ? { type: m.type, cur, interval, candles } : null;
  } catch { return null; }
}
// Merge newer candles into an ascending series: same open time replaces, later ones append, older ones are ignored
// unless they fill a gap. Keeps at most `max` (the oldest drop off).
export function mergeCandles(series, add, max = 2000) {
  const out = series.slice();
  for (const k of add) {
    const last = out[out.length - 1];
    if (!last || k.t > last.t) out.push(k);
    else if (k.t === last.t) out[out.length - 1] = k;
    else { let lo = 0, hi = out.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (out[m].t < k.t) lo = m + 1; else hi = m; } if (out[lo].t === k.t) out[lo] = k; else out.splice(lo, 0, k); }
  }
  return out.length > max ? out.slice(out.length - max) : out;
}
// Time axis spacing for the trading chart: the smallest round step (minutes; 43200 = a month) that keeps labels ~100 px apart.
export const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080, 43200, 129600, 525600];
export function timeStep(tfMinutes, pxPerCandle, minPx = 100) { return TIME_STEPS.find((s) => s >= tfMinutes && s / tfMinutes * pxPerCandle >= minPx) || 525600; }
// Does a step boundary fall in (prev, t]? Hours and days count in local time (or UTC); months and years on the calendar.
export function onStep(t, prev, step, utc) {
  const d = new Date(t), p = new Date(prev), mo = (x) => (utc ? x.getUTCFullYear() * 12 + x.getUTCMonth() : x.getFullYear() * 12 + x.getMonth());
  if (step >= 43200) { const n = step / 43200; return Math.floor(mo(d) / n) !== Math.floor(mo(p) / n); }
  const off = (x) => (utc ? 0 : x.getTimezoneOffset() * 6e4), k = (ms, x) => Math.floor((ms - off(x)) / (step * 6e4));
  if (step === 10080) { const wk = (ms, x) => Math.floor((ms - off(x) - 4 * 864e5) / 6048e5); return wk(t, d) !== wk(prev, p); } // weeks start Monday
  return k(t, d) !== k(prev, p);
}
// Moving averages and RSI over closes. Entries before there is enough data are NaN (not drawn).
export function sma(vals, n) {
  const out = new Array(vals.length).fill(NaN); let sum = 0;
  for (let i = 0; i < vals.length; i++) { sum += vals[i]; if (i >= n) sum -= vals[i - n]; if (i >= n - 1) out[i] = sum / n; }
  return out;
}
export function ema(vals, n) {
  const out = new Array(vals.length).fill(NaN), k = 2 / (n + 1); if (vals.length < n) return out;
  let e = vals.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = e; // seeded with the simple average
  for (let i = n; i < vals.length; i++) { e = vals[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
// Wilder's RSI.
export function rsi(vals, n = 14) {
  const out = new Array(vals.length).fill(NaN); if (vals.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = vals[i] - vals[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < vals.length; i++) { const d = vals[i] - vals[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return out;
}
// Bollinger Bands (n, k standard deviations) and MACD (fast, slow, signal) over closes; NaN until there is enough data.
export function bollinger(vals, n = 20, k = 2) {
  const mid = sma(vals, n), up = mid.slice(), lo = mid.slice();
  for (let i = n - 1; i < vals.length; i++) { let v = 0; for (let j = i - n + 1; j <= i; j++) v += (vals[j] - mid[i]) ** 2; const sd = Math.sqrt(v / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd; }
  return { mid, up, lo };
}
export function macd(vals, fast = 12, slow = 26, sig = 9) {
  const f = ema(vals, fast), s = ema(vals, slow), line = vals.map((_, i) => f[i] - s[i]);
  const start = line.findIndex(Number.isFinite), signal = new Array(vals.length).fill(NaN);
  if (start >= 0) { const e = ema(line.slice(start), sig); for (let i = 0; i < e.length; i++) signal[start + i] = e[i]; }
  return { macd: line, signal, hist: line.map((v, i) => v - signal[i]) };
}
// ---- Order book and trades (Kraken v2 websocket) ----
// Kraken's precision for BTC pairs: prices to 0.1 (JPY to 1), amounts to 8 decimals. Used by the book checksum.
export const pricePrecision = (cur) => (cur === 'JPY' ? 0 : 1);
const lvl = (x) => ({ p: x.price, q: x.qty });
// Pure: raw text -> { type, cur, bids, asks, checksum } for a BTC book frame, else null.
export function parseBook(raw) {
  try {
    const m = JSON.parse(raw); if (!m || m.channel !== 'book' || !Array.isArray(m.data) || !m.data[0]) return null;
    const d = m.data[0]; if (!/^BTC\/[A-Z]{3}$/.test(d.symbol)) return null;
    const ok = (a) => (Array.isArray(a) ? a : []).filter((x) => x && Number.isFinite(x.price) && Number.isFinite(x.qty)).map(lvl);
    return { type: m.type, cur: d.symbol.slice(4), bids: ok(d.bids), asks: ok(d.asks), checksum: d.checksum };
  } catch { return null; }
}
// Apply a frame to a book ({bids: best first, asks: best first}). A snapshot replaces it; in an update an amount of 0
// removes the level. Levels beyond `depth` are dropped, as Kraken expects.
export function applyBook(book, f, depth = 25) {
  const side = (cur, ch, desc) => {
    const m = new Map(f.type === 'snapshot' ? [] : cur.map((x) => [x.p, x.q]));
    for (const x of ch) { if (x.q === 0) m.delete(x.p); else m.set(x.p, x.q); }
    return [...m].map(([p, q]) => ({ p, q })).sort((a, b) => (desc ? b.p - a.p : a.p - b.p)).slice(0, depth);
  };
  return { bids: side(book ? book.bids : [], f.bids, true), asks: side(book ? book.asks : [], f.asks, false) };
}
// CRC32 (IEEE), as Kraken's book checksum uses.
let CRC;
export function crc32(str) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < str.length; i++) c = CRC[(c ^ str.charCodeAt(i)) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// Kraken's checksum of the top 10 asks then the top 10 bids: price and amount at their precision, without the point or leading zeros.
export function bookChecksum(book, pp, qp = 8) {
  const f = (v, d) => v.toFixed(d).replace('.', '').replace(/^0+/, '');
  const part = (a) => a.slice(0, 10).map((x) => f(x.p, pp) + f(x.q, qp)).join('');
  return crc32(part(book.asks) + part(book.bids));
}
// Pure: raw text -> { type, cur, trades: [{ id, t, side, p, q }] } (newest last) for BTC trade frames, else null.
export function parseTrades(raw) {
  try {
    const m = JSON.parse(raw); if (!m || m.channel !== 'trade' || !Array.isArray(m.data)) return null; let cur = '';
    const trades = m.data.filter((d) => d && /^BTC\/[A-Z]{3}$/.test(d.symbol) && Number.isFinite(d.price) && Number.isFinite(d.qty)).map((d) => { cur = d.symbol.slice(4); return { id: d.trade_id, t: Date.parse(d.timestamp), side: d.side === 'sell' ? 'sell' : 'buy', p: d.price, q: d.qty }; });
    return trades.length ? { type: m.type, cur, trades } : null;
  } catch { return null; }
}
// ---- Price alerts: { id, cur, price, dir: 'up' | 'down', sound } fire once when the price reaches them ----
export const alertDir = (target, now) => (target >= now ? 'up' : 'down');
export function splitPriceAlerts(list, prices) {
  const hit = [], rest = [];
  for (const a of list || []) { const p = prices && prices[a.cur]; (Number.isFinite(p) && (a.dir === 'up' ? p >= a.price : p <= a.price) ? hit : rest).push(a); }
  return { hit, rest };
}
// "60,000", "60.000,5", "59 500.5", "1,5": the last of ',' and '.' is the decimal mark when both appear; a lone ',' is
// a thousands mark only in groups of three.
export function parsePriceInput(s) {
  let x = String(s).trim().replace(/[\s'’]/g, ''); const lc = x.lastIndexOf(','), ld = x.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) x = lc > ld ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (lc >= 0) x = /^\d{1,3}(,\d{3})+$/.test(x) ? x.replace(/,/g, '') : x.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3}){2,}$/.test(x)) x = x.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(x)) return NaN;
  const v = parseFloat(x); return v > 0 && v < 1e12 ? v : NaN;
}
// Price label precision for a value (JPY prices are big, small moves still need cents elsewhere).
export const priceDigits = (v) => (v >= 1e5 ? 0 : v >= 100 ? 1 : 2);

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

// ---- "Your block": a personal date on the chain ----
export const GENESIS_TS = 1231006505; // 2009-01-03 18:15:05 UTC
// 'YYYY-MM-DD' -> unix seconds at 12:00 UTC that day (the middle of the day in most time zones), or NaN.
export function noonTs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return NaN;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], 12); const d = new Date(ms);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? ms / 1000 : NaN;
}
// The next round number of blocks since a height: steps of 100 below 1,000, then 1,000, 10,000 and 100,000.
export function nextMilestone(since) {
  const step = since < 1000 ? 100 : since < 10000 ? 1000 : since < 100000 ? 10000 : 100000;
  const n = (Math.floor(Math.max(0, since) / step) + 1) * step; return { blocks: n, inBlocks: n - since };
}
// A future time -> the block expected then, at one block every 10 minutes from the tip.
export function heightAt(ts, tip, nowMs = Date.now()) { return tip + Math.round((ts * 1000 - nowMs) / (TARGET_SEC * 1000)); }
// mempool.space /v1/historical-price?timestamp= -> the price for that time (the latest entry at or before it), or NaN.
export function priceAt(resp, cur, ts) {
  const pts = ((resp && resp.prices) || []).filter((p) => Number.isFinite(p[cur]) && p[cur] > 0 && p.time <= ts + 7 * 86400).sort((a, b) => a.time - b.time);
  const before = pts.filter((p) => p.time <= ts); const p = before.length ? before[before.length - 1] : pts[0]; return p ? p[cur] : NaN;
}
// ---- the block being mined ----
export const TWO32 = 4294967296; // a difficulty of 1 takes 2^32 hashes on average
// Average seconds to find a block at this difficulty and hashrate (falls back to the 10-minute target without data).
export function expectedBlockSec(difficulty, hashrate) { return difficulty > 0 && hashrate > 0 ? difficulty * TWO32 / hashrate : TARGET_SEC; }
// Mining has no memory: the chance of a block within the next `sec` seconds is the same however long the search has run.
export function chanceWithin(sec, mean) { return sec > 0 && mean > 0 ? 1 - Math.exp(-sec / mean) : 0; }
// The number a block's hash must not exceed, as 64 hex digits: 0xffff * 2^208 / difficulty.
export function miningTarget(difficulty) {
  if (!(difficulty >= 1) || !Number.isFinite(difficulty)) return null;
  return ((0xffffn << 208n) / BigInt(Math.round(difficulty))).toString(16).padStart(64, '0');
}
export function leadingZeros(hex) { return (/^0*/.exec(String(hex || '')) || [''])[0].length; }
// Each pool's share of the blocks in a mining/pools response, largest first; the rest are summed as one entry (name null).
export function poolShares(resp, top = 6) {
  const ps = ((resp && resp.pools) || []).filter((p) => p.blockCount > 0).sort((a, b) => b.blockCount - a.blockCount), total = ps.reduce((s, p) => s + p.blockCount, 0);
  if (!total) return [];
  const out = ps.slice(0, top).map((p) => ({ name: p.name, share: p.blockCount / total, blocks: p.blockCount })), rest = ps.slice(top).reduce((s, p) => s + p.blockCount, 0);
  if (rest) out.push({ name: null, share: rest / total, blocks: rest });
  return out;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
// Very large counts as 4.1 × 10²³ (plain digits below a million).
export function fmtSci(n) {
  if (!Number.isFinite(n)) return '–'; if (Math.abs(n) < 1e6) return fmtNum(n);
  let e = Math.floor(Math.log10(Math.abs(n))), m = n / 10 ** e; if (Math.abs(m) >= 9.95) { m /= 10; e++; }
  return m.toFixed(1) + ' × 10' + String(e).split('').map((d) => SUP[d]).join('');
}
// ---- the block picture: every transaction as a square ----
// A feed row from mempool.space ([txid, fee, vsize, value, rate, ...]) as a transaction.
export const ptx = (r) => ({ id: r[0], fee: r[1], vsize: r[2], rate: r[4] });
// Apply a projected-block-transactions frame (a full list, or a delta of added / removed / changed) to a Map of txid -> tx.
export function applyBlockFrame(map, f) {
  if (!f) return map;
  if (Array.isArray(f.blockTransactions)) { map.clear(); for (const r of f.blockTransactions) map.set(r[0], ptx(r)); return map; }
  const d = f.delta || {};
  for (const id of d.removed || []) map.delete(id);
  for (const r of d.added || []) map.set(r[0], ptx(r));
  for (const [id, rate] of d.changed || []) { const x = map.get(id); if (x && Number.isFinite(rate)) map.set(id, Object.assign({}, x, { rate })); }
  return map;
}
// Pack transactions into a grid x grid block, highest fee rate first from the bottom left, each a square whose area is its
// size. The cell size grows until everything fits, so a full block fills the square. y counts up from the bottom.
export function packBlock(list, grid = 75) {
  const txs = list.filter((t) => t.vsize > 0).sort((a, b) => b.rate - a.rate || b.vsize - a.vsize), cap = grid * grid * 0.94;
  // pick the cell size so the squares cover the share of the block that is full (rounding small ones up costs area)
  const goal = cap * Math.min(1, txs.reduce((a, t) => a + t.vsize, 0) / 1e6); let unit = 1e6 / (grid * grid), lo = unit / 50, hi = unit * 50;
  const side = (v) => Math.max(1, Math.min(grid, Math.round(Math.sqrt(v / unit)))), area = () => txs.reduce((a, t) => a + side(t.vsize) ** 2, 0);
  for (let k = 0; k < 24; k++) { unit = Math.sqrt(lo * hi); if (area() > goal) lo = unit; else hi = unit; } unit = hi;
  const occ = new Uint8Array(grid * grid), first = new Int32Array(grid), out = []; let low = 0;
  const free = (x, y, s) => { for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) if (occ[j * grid + i]) return false; return true; };
  for (const t of txs) {
    const s = side(t.vsize);
    place: for (let y = low; y + s <= grid; y++) for (let x = first[y]; x + s <= grid; x++) {
      if (occ[y * grid + x] || !free(x, y, s)) continue;
      for (let j = y; j < y + s; j++) { for (let i = x; i < x + s; i++) occ[j * grid + i] = 1; while (first[j] < grid && occ[j * grid + first[j]]) first[j]++; }
      out.push({ id: t.id, x, y, s, rate: t.rate, vsize: t.vsize, fee: t.fee }); break place;
    }
    while (low < grid && first[low] >= grid) low++;
  }
  out.unit = unit; return out;
}
// Add transactions to a block already drawn, without moving anything: each goes into the lowest free spot (highest fee
// rates placed first), at the cell size of the last full layout. Returns the new squares and the ones that did not fit.
export function fitInto(placed, adds, grid, unit) {
  const occ = new Uint8Array(grid * grid), out = [], left = [];
  for (const p of placed) for (let j = p.y; j < Math.min(grid, p.y + p.s); j++) for (let i = p.x; i < Math.min(grid, p.x + p.s); i++) occ[j * grid + i] = 1;
  const free = (x, y, s) => { for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) if (occ[j * grid + i]) return false; return true; };
  for (const t of adds.filter((a) => a.vsize > 0).sort((a, b) => b.rate - a.rate)) {
    const s = Math.max(1, Math.min(grid, Math.round(Math.sqrt(t.vsize / unit)))); let done = false, y0 = grid;
    for (const p of placed) if (p.rate <= t.rate && p.y < y0) y0 = p.y; // start where its fee band starts, so colours stay in order
    if (y0 >= grid) y0 = 0;
    place: for (let n = 0; n + s <= grid; n++) for (let x = 0, y = (y0 + n) % (grid - s + 1); x + s <= grid; x++) {
      if (occ[y * grid + x] || !free(x, y, s)) continue;
      for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) occ[j * grid + i] = 1;
      out.push({ id: t.id, x, y, s, rate: t.rate, vsize: t.vsize, fee: t.fee, misplaced: y < y0 || y > y0 + Math.max(3, s * 2) }); done = true; break place;
    }
    if (!done) left.push(t);
  }
  return { placed: out, left };
}
// Without the live feed: a stand-in block with the projected block's count, size and fee spread (marked approximate).
export function approxBlock(pb, seed = 1) {
  if (!pb || !(pb.nTx > 0)) return [];
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
  const n = Math.min(pb.nTx, 5000), fr = (pb.feeRange || []).filter(Number.isFinite), avg = (pb.blockVSize || 0) / pb.nTx || 250, out = [];
  const rateAt = (q) => { if (!fr.length) return pb.medianFee || 1; const p = q * (fr.length - 1), i = Math.floor(p), k = p - i; return fr[i] + ((fr[i + 1] ?? fr[i]) - fr[i]) * k; };
  for (let i = 0; i < n; i++) { const v = avg * Math.exp((rnd() + rnd() + rnd() - 1.5) * 1.1) * (pb.nTx / n); out.push({ id: 'approx-' + i, fee: 0, vsize: v, rate: rateAt(rnd()) }); }
  return out;
}
