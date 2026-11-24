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
export function sparse(n) { return n; }

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
export function fmtFee(v) { return Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : String(Math.round(v))) : '–'; }
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
