import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../src/lib.js';
import { parseTicker } from '../src/price.js';
import { TABLES, LANGS } from '../src/i18n.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));

test('subsidy halves every 210000 blocks', () => {
  assert.equal(L.subsidy(0), 5000000000);
  assert.equal(L.subsidy(209999), 5000000000);
  assert.equal(L.subsidy(210000), 2500000000);
  assert.equal(L.subsidy(840000), 312500000);
  assert.equal(L.subsidy(1050000), 156250000);
  assert.equal(L.subsidy(210000 * 64), 0);
});
test('supply is exact at known heights', () => {
  assert.equal(L.supplyAt(0), 5000000000);
  assert.equal(L.supplyAt(209999), 1050000000000000);
  assert.equal(L.supplyAt(210000), 1050000000000000 + 2500000000);
  assert.ok(L.supplyAt(10000000) <= L.MAX_SATS && L.supplyAt(10000000) > 2099999990000000);
});
test('halving info', () => {
  const h = L.halvingInfo(977411, 0);
  assert.equal(h.epoch, 4); assert.equal(h.nextHeight, 1050000); assert.equal(h.blocksToGo, 72589);
  assert.equal(h.subsidy, 312500000); assert.equal(h.nextSubsidy, 156250000);
  assert.ok(h.progress > 0.65 && h.progress < 0.66);
  assert.equal(h.estMs, 72589 * 600000);
});
test('future estimate for alarms', () => {
  const f = L.futureEstimate(1000, 990, 0); assert.equal(f.blocks, 10); assert.equal(f.ms, 6000000); assert.equal(f.past, false);
  assert.equal(L.futureEstimate(990, 990, 0).past, true);
});
test('formatting', () => {
  assert.equal(L.fmtHashrate(1.0378e21), '1.04 ZH/s');
  assert.equal(L.fmtHashrate(950e18), '950 EH/s');
  assert.equal(L.fmtDifficulty(134823837323272.7), '134.82 T');
  assert.equal(L.fmtDuration(90061), '1d 1h 1m');
  assert.equal(L.fmtAgo(30), '30s');
  assert.equal(L.fmtFee(1), '1.0'); assert.equal(L.fmtFee(55.4), '55');
  assert.equal(L.fmtDate(Date.UTC(2024, 3, 20, 0, 9), { utc: true }), '2024-04-20 00:09');
  assert.equal(L.fmtDate(Date.UTC(2024, 3, 20, 15, 9), { utc: true, h12: true, dateFmt: 'mdy' }), '04/20/2024 3:09 PM');
  assert.equal(L.moscowTime(1676), '16:76');
});
test('sats per dollar and market cap', () => {
  assert.equal(L.satsPerUnit(100000), 1000);
  assert.ok(Number.isNaN(L.satsPerUnit(0)));
  const p = fx('prices.json'); assert.ok(p.USD > 0 && L.satsPerUnit(p.USD) > 100);
  assert.equal(Math.round(L.marketCapUsd(840000, 1)), 19687503);
});
test('input parsing', () => {
  assert.equal(L.parseHeightInput('840,000'), 840000);
  assert.ok(Number.isNaN(L.parseHeightInput('abc'))); assert.ok(Number.isNaN(L.parseHeightInput('-5')));
  assert.equal(L.parseTipHeight(fs.readFileSync(new URL('./fixtures/tip.txt', import.meta.url), 'utf8')), 977411);
});
test('recorded difficulty response parses', () => {
  const d = L.parseDifficulty(fx('difficulty.json'));
  assert.ok(d.progress > 0 && d.progress < 1); assert.equal(d.nextHeight % 2016, 0); assert.ok(d.blocksLeft > 0);
});
test('recorded hashrate response gives averages', () => {
  const h = fx('hashrate.json'); const a = L.hashrateAverages(h.hashrates, h.currentHashrate);
  for (const k of ['current', 'd7', 'd14', 'd30', 'd90']) assert.ok(a[k] > 1e18, k);
});
test('recorded blocks give block time stats and parsed block', () => {
  const b = fx('blocks.json'); const s = L.blockTimeStats(b, b[0].timestamp + 100);
  assert.equal(s.count, b.length); assert.equal(s.since, 100); assert.ok(s.avg > 0 && s.fast + s.slow === b.length - 1);
  const p = L.parseBlock(b[0]); assert.equal(p.height, b[0].height); assert.ok(p.reward >= L.subsidy(p.height)); assert.ok(p.fees >= 0);
  assert.equal(p.empty, false);
});
test('recorded mempool depth', () => {
  const m = fx('mempool.json'); assert.ok(L.mempoolDepth(m) > 0);
});

test('Kraken ticker parsing from recorded messages', () => {
  const raw = (n) => fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
  assert.deepEqual(parseTicker(raw('kraken-ticker.json')), [{ cur: 'GBP', price: 45593.6, pct: -2.79 }]);
  assert.deepEqual(parseTicker(raw('kraken-subscribe.json')), []);
  assert.deepEqual(parseTicker('not json'), []);
  assert.deepEqual(parseTicker(JSON.stringify({ channel: 'ticker', data: [{ symbol: 'BTC/USD', last: -1 }, { symbol: 'ETH/USD', last: 5 }, { symbol: 'BTC/USD', last: 61000.5 }] })), [{ cur: 'USD', price: 61000.5, pct: null }]);
});

test('block colours follow the mempool.space fee ramp', () => {
  assert.equal(L.FEE_BREAKS.length, L.FEE_COLORS.length);
  assert.equal(L.feeColor(0), '#007d3d'); assert.equal(L.feeColor(0.5), '#007d3d'); assert.equal(L.feeColor(1), '#557d00');
  assert.equal(L.feeColor(10), '#8c7d09'); assert.equal(L.feeColor(5000), '#ae005b');
  assert.equal(L.MINED_TOP, '#9339f4'); assert.equal(L.MINED_BOTTOM, '#105fb0');
  const pb = fx('mempool-blocks.json')[0]; const bg = L.feeStripes(pb.feeRange);
  assert.ok(bg.startsWith('linear-gradient(to right') || bg.startsWith('#'));
  assert.equal(L.feeStripes([]), L.UPCOMING_EMPTY); assert.equal(L.feeStripes([3, 3.4]), L.feeColor(3));
});

test('every language has every label and no empty strings', () => {
  const en = Object.keys(TABLES.en).sort();
  assert.deepEqual(Object.keys(LANGS).sort(), Object.keys(TABLES).sort());
  for (const [l, tab] of Object.entries(TABLES)) { assert.deepEqual(Object.keys(tab).sort(), en, l); for (const v of Object.values(tab)) assert.ok(typeof v === 'string' && v.trim().length > 0, l); }
  assert.ok(Object.keys(TABLES).length >= 8);
});

test('alarms: reached at or below the tip, waiting above it, nothing before the tip is known', () => {
  const list = [{ height: 100 }, { height: 101 }, { height: 102, label: 'x' }];
  const r = L.splitAlarms(list, 101);
  assert.deepEqual(r.hit.map((a) => a.height), [100, 101]); assert.deepEqual(r.rest.map((a) => a.height), [102]);
  assert.deepEqual(L.splitAlarms(list, NaN), { hit: [], rest: list });
  assert.deepEqual(L.splitAlarms(null, 5), { hit: [], rest: [] });
});

test('version number matches in the app, the offline cache name and the README', () => {
  const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const v = read('src/app.js').match(/VERSION = '([\d.]+)'/)[1];
  assert.ok(read('sw.js').includes(`'blockhorizon-v${v}'`), 'sw.js cache name');
  assert.ok(read('README.md').includes(`## Features (v${v})`), 'README');
});
