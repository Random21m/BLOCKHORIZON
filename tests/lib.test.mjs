import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../src/lib.js';
import { parseTicker } from '../src/price.js';
import { TABLES, LANGS } from '../src/i18n.js';
import { GLOSSARY, ANNIVERSARIES } from '../src/content.js';
import { GLOSSARY_TR, ANNIV_TR } from '../src/content-i18n.js';

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
  assert.equal(L.fmtFee(1), '1.0'); assert.equal(L.fmtFee(55.4), '55'); assert.equal(L.fmtFee(3600000), (3600000).toLocaleString());
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

test('version number matches in the app (state.js), the offline cache name and the README', () => {
  const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const v = read('src/state.js').match(/VERSION = '([\d.]+)'/)[1];
  assert.ok(read('sw.js').includes(`'blockhorizon-v${v}'`), 'sw.js cache name');
  assert.ok(read('README.md').includes(`Version ${v}.`), 'README');
});

test('transactions: txid check, parse a confirmed and a waiting transaction', () => {
  assert.ok(L.isTxid(' 2bb85f4b004be6da54f766c17c1e855187327112c231ef2ff35ebad0ea67c69e ')); assert.ok(!L.isTxid('840000')); assert.ok(!L.isTxid('zz'.repeat(32)));
  const c = L.parseTx(fx('tx-confirmed.json'), 840009);
  assert.deepEqual([c.confirmed, c.height, c.confs, c.fee, c.vsize, c.ins, c.outs], [true, 840000, 10, 673200000, 187, 1, 2]);
  const m = L.parseTx(fx('tx-mempool.json'), 977411);
  assert.deepEqual([m.confirmed, m.confs, m.vsize], [false, 0, 189]); assert.ok(Math.abs(m.feeRate - 1128 / 189) < 1e-9);
});

test('transactions: place in the queue of projected blocks', () => {
  const proj = [{ feeRange: [5, 10] }, { feeRange: [2, 4] }, { medianFee: 1 }];
  assert.equal(L.txQueuePos(6, proj), 0); assert.equal(L.txQueuePos(3, proj), 1); assert.equal(L.txQueuePos(1, proj), 2); assert.equal(L.txQueuePos(0.5, proj), -1); assert.equal(L.txQueuePos(9, null), -1);
});

test('payment size: common address types, at least one input and output', () => {
  assert.equal(L.txVsize(1, 2), 141); assert.equal(L.txVsize(1, 1), 110); assert.equal(L.txVsize(2, 2), 209);
  assert.equal(L.txVsize(1, 2, 'taproot'), 154); assert.equal(L.txVsize(1, 2, 'legacy'), 226); assert.equal(L.txVsize(0, 0), L.txVsize(1, 1));
});

test('translations: same {placeholders} as English, and every key the app uses exists', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const [l, tab] of Object.entries(TABLES)) for (const [k, v] of Object.entries(tab)) assert.equal(ph(v), ph(TABLES.en[k]), `${l}.${k}`);
  const app = fs.readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.js') && !['i18n.js', 'strings.js'].includes(f)).map((f) => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')).join('\n');
  const used = new Set([...app.matchAll(/\bt\('(\w+)'/g)].map((m) => m[1]));
  for (const m of app.matchAll(/\['\/[\w/]*', '(\w+)'\]/g)) used.add(m[1]); // menu entries
  for (const k of ['minedAbout', 'estimated', 'tab_display', 'tab_format', 'tab_sounds']) used.add(k); // picked at run time
  for (const k of used) if (!k.endsWith('_')) assert.ok(TABLES.en[k], 'missing key ' + k);
});

test('offline cache lists every source file', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const f of fs.readdirSync(new URL('../src/', import.meta.url)).filter((x) => x.endsWith('.js'))) assert.ok(sw.includes(`'src/${f}'`), 'sw.js is missing src/' + f);
});

test('fee alerts: reached at or below the limit for the chosen speed; nothing without fee data', () => {
  const fees = fx('fees.json'), list = [{ level: 'next', max: fees.fastestFee }, { level: 'next', max: fees.fastestFee - 0.5 }, { level: 'h1', max: fees.hourFee + 1 }, { level: 'h30', max: 0.01 }];
  const r = L.splitFeeAlerts(list, fees);
  assert.deepEqual(r.hit, [list[0], list[2]]); assert.deepEqual(r.rest, [list[1], list[3]]);
  assert.deepEqual(L.splitFeeAlerts(list, null), { hit: [], rest: list });
  assert.equal(L.parseFeeLimit(' 2,5 '), 2.5); assert.ok(Number.isNaN(L.parseFeeLimit('0'))); assert.ok(Number.isNaN(L.parseFeeLimit('abc')));
});

test('glossary and anniversaries: every language has every entry, none empty', () => {
  for (const l of Object.keys(LANGS).filter((x) => x !== 'en')) {
    assert.equal(GLOSSARY_TR[l]?.length, GLOSSARY.length, 'glossary ' + l); assert.equal(ANNIV_TR[l]?.length, ANNIVERSARIES.length, 'anniversaries ' + l);
    for (const [k, v] of GLOSSARY_TR[l]) assert.ok(k.trim() && v.trim().length > 20, l + ' ' + k);
    for (const x of ANNIV_TR[l]) assert.ok(x.trim(), l);
  }
});

test('history charts: series from recorded responses, ascending, missing values dropped', () => {
  const pr = L.SERIES.price(fx('price-history.json'), 'USD');
  assert.ok(pr.length > 1000 && pr.every((p, i) => i === 0 || p.t > pr[i - 1].t) && pr.every((p) => p.v > 0));
  assert.deepEqual(L.SERIES.price({ prices: [{ time: 2, USD: -1 }, { time: 1, USD: 5 }] }, 'USD'), [{ t: 1000, v: 5 }]);
  const hr = L.SERIES.hashrate(fx('hashrate-1y.json')), df = L.SERIES.difficulty(fx('hashrate-1y.json')), fe = L.SERIES.fees(fx('feerates-1m.json'));
  assert.ok(hr.length > 300 && df.length > 20 && fe.length > 100); assert.ok(fe.some((p) => p.v === 0) || fe.every((p) => p.v >= 0));
});

test('history charts: date range, thinning, ticks, nearest point', () => {
  const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i * 864e5, v: i + 1 })), now = 999 * 864e5;
  assert.equal(L.inRange(pts, '1m', now).length, 31); assert.equal(L.inRange(pts, 'all', now).length, 1000);
  const th = L.thin(pts, 100); assert.equal(th.length, 100); assert.equal(th[0], pts[0]); assert.equal(th[99], pts[999]); assert.equal(L.thin(pts.slice(0, 5), 100).length, 5);
  assert.deepEqual(L.ticks(0, 100, false), [0, 20, 40, 60, 80, 100]); assert.deepEqual(L.ticks(3, 47, false), [10, 20, 30, 40]);
  assert.deepEqual(L.ticks(0.05, 120000, true), [0.1, 1, 10, 100, 1000, 10000, 100000]); assert.deepEqual(L.ticks(15, 600, true), [20, 50, 100, 200, 500]);
  assert.equal(L.nearest(pts, 10.4 * 864e5), 10); assert.equal(L.nearest(pts, -5), 0); assert.equal(L.nearest(pts, 1e15), 999); assert.equal(L.nearest([], 1), -1);
});

test('history charts: trailing day average', () => {
  const pts = [0, 1, 2, 3, 4].map((d) => ({ t: d * 864e5, v: d % 2 ? 10 : 0 }));
  assert.deepEqual(L.smoothDays(pts, 2).map((p) => p.v), [0, 5, 5, 5, 5]); assert.equal(L.smoothDays(pts, 0), pts);
  assert.deepEqual(L.smoothDays(pts, 1).map((p) => p.v), [0, 10, 0, 10, 0]);
});

test('every page file the offline cache lists is published by the Pages workflow', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), wf = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const cp = (wf.match(/cp -r ([^\n]+) _site\//) || [])[1].split(/\s+/);
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  for (const f of files.filter((x) => x !== './')) assert.ok(cp.includes(f.split('/')[0]), f + ' is cached but not published');
});

test('your block: dates, milestones, future height, price that week', () => {
  assert.equal(L.noonTs('2016-05-14'), 1463227200); assert.ok(Number.isNaN(L.noonTs('2016-02-30'))); assert.ok(Number.isNaN(L.noonTs('14.05.2016'))); assert.ok(Number.isNaN(L.noonTs('')));
  assert.deepEqual(L.nextMilestone(42), { blocks: 100, inBlocks: 58 }); assert.deepEqual(L.nextMilestone(5000), { blocks: 6000, inBlocks: 1000 });
  assert.deepEqual(L.nextMilestone(65691), { blocks: 70000, inBlocks: 4309 }); assert.deepEqual(L.nextMilestone(565691), { blocks: 600000, inBlocks: 34309 });
  assert.equal(L.heightAt(1000 + 6000, 900000, 1000 * 1000), 900010);
  const hp = fx('price-history.json'), ts = 1699963200; const p = L.priceAt(hp, 'USD', ts);
  const near = hp.prices.filter((x) => x.time <= ts).sort((a, b) => b.time - a.time)[0]; assert.equal(p, near.USD);
  assert.equal(L.priceAt({ prices: [{ time: 100, USD: 5 }] }, 'USD', 50), 5); assert.ok(Number.isNaN(L.priceAt({ prices: [] }, 'USD', 50)));
});
