import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../src/lib.js';
import { parseTicker, parseBackupTicker, BACKUP_CURRENCIES, CURRENCIES } from '../src/price.js';
import { normServer, esploraFor, esploraFees } from '../src/api.js';
import { LANGS, loadLang, setLang, t, getLang, detectLang, isRtl } from '../src/i18n.js';
// every language's texts, as the app would load them one at a time
const TABLES = Object.fromEntries(
  await Promise.all(Object.keys(LANGS).map(async (l) => [l, (await import(`../src/lang/${l}.js`)).default]))
);
import { GLOSSARY, ANNIVERSARIES } from '../src/content.js';
import { GLOSSARY_TR, ANNIV_TR } from '../src/content-i18n.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));

test('duration units follow the language (and go back to English)', () => {
  L.setUnits({ y: 'J', d: 'T', h: 'h', m: 'min', s: 's' });
  try {
    assert.equal(L.fmtDuration(90061), '1T 1h 1min');
    assert.equal(L.fmtAgo(30), '30s');
    assert.equal(L.fmtLong(31557600 + 3600), '1J 0T 1h 0min 0s');
  } finally {
    L.setUnits({ y: 'y', d: 'd', h: 'h', m: 'm', s: 's' });
  }
  assert.equal(L.fmtDuration(90061), '1d 1h 1m');
});
test('final bitcoin block: 6,929,999 pays the last sat; countdown and long durations', () => {
  assert.equal(L.FINAL_BLOCK, 6929999);
  assert.equal(L.subsidy(L.FINAL_BLOCK), 1);
  assert.equal(L.subsidy(L.FINAL_BLOCK + 1), 0);
  const c = L.finalCountdown(L.FINAL_BLOCK - 6, 1000, 1000 * 1000 + 60 * 1000);
  assert.equal(c.blocks, 6);
  assert.equal(c.sec, 3540);
  assert.equal(c.done, false);
  assert.equal(L.finalCountdown(L.FINAL_BLOCK, 1000).done, true);
  assert.equal(L.finalCountdown(L.FINAL_BLOCK + 5, 1000, 0).sec, 0);
  assert.equal(L.fmtLong(3540), '0h 59m 0s');
  assert.equal(L.fmtLong(86400 + 61), '1d 0h 1m 1s');
  assert.equal(L.fmtLong(31557600 * 113 + 86400 * 2 + 5), '113y 2d 0h 0m 5s');
});
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
  assert.equal(h.epoch, 4);
  assert.equal(h.nextHeight, 1050000);
  assert.equal(h.blocksToGo, 72589);
  assert.equal(h.subsidy, 312500000);
  assert.equal(h.nextSubsidy, 156250000);
  assert.ok(h.progress > 0.65 && h.progress < 0.66);
  assert.equal(h.estMs, 72589 * 600000);
});
test('future estimate for alarms', () => {
  const f = L.futureEstimate(1000, 990, 0);
  assert.equal(f.blocks, 10);
  assert.equal(f.ms, 6000000);
  assert.equal(f.past, false);
  assert.equal(L.futureEstimate(990, 990, 0).past, true);
});
test('formatting', () => {
  assert.equal(L.fmtHashrate(1.0378e21), '1.04 ZH/s');
  assert.equal(L.fmtHashrate(950e18), '950 EH/s');
  assert.equal(L.fmtDifficulty(134823837323272.7), '134.82 T');
  assert.equal(L.trimZeros('100.00K'), '100K');
  assert.equal(L.trimZeros('92.50 T'), '92.5 T');
  assert.equal(L.trimZeros('0.05'), '0.05');
  assert.equal(L.trimZeros('1,100'), '1,100');
  assert.equal(L.fmtDuration(90061), '1d 1h 1m');
  assert.equal(L.fmtAgo(30), '30s');
  assert.equal(L.fmtFee(1), '1.0');
  assert.equal(L.fmtFee(55.4), '55');
  assert.equal(L.fmtFee(3600000), (3600000).toLocaleString());
  assert.equal(L.fmtDate(Date.UTC(2024, 3, 20, 0, 9), { utc: true }), '2024-04-20 00:09');
  assert.equal(L.fmtDate(Date.UTC(2024, 3, 20, 15, 9), { utc: true, h12: true, dateFmt: 'mdy' }), '04/20/2024 3:09 PM');
  assert.equal(L.moscowTime(1676), '16:76');
});
test('sats per dollar and market cap', () => {
  assert.equal(L.satsPerUnit(100000), 1000);
  assert.ok(Number.isNaN(L.satsPerUnit(0)));
  const p = fx('prices.json');
  assert.ok(p.USD > 0 && L.satsPerUnit(p.USD) > 100);
  assert.equal(Math.round(L.marketCapUsd(840000, 1)), 19687503);
});
test('input parsing', () => {
  assert.equal(L.parseHeightInput('840,000'), 840000);
  assert.ok(Number.isNaN(L.parseHeightInput('abc')));
  assert.ok(Number.isNaN(L.parseHeightInput('-5')));
  assert.equal(L.parseTipHeight(fs.readFileSync(new URL('./fixtures/tip.txt', import.meta.url), 'utf8')), 977411);
});
test('recorded difficulty response parses', () => {
  const d = L.parseDifficulty(fx('difficulty.json'));
  assert.ok(d.progress > 0 && d.progress < 1);
  assert.equal(d.nextHeight % 2016, 0);
  assert.ok(d.blocksLeft > 0);
});
test('recorded hashrate response gives averages', () => {
  const h = fx('hashrate.json');
  const a = L.hashrateAverages(h.hashrates, h.currentHashrate);
  for (const k of ['current', 'd7', 'd14', 'd30', 'd90']) assert.ok(a[k] > 1e18, k);
});
test('recorded blocks give block time stats and parsed block', () => {
  const b = fx('blocks.json');
  const s = L.blockTimeStats(b, b[0].timestamp + 100);
  assert.equal(s.count, b.length);
  assert.equal(s.since, 100);
  assert.ok(s.avg > 0 && s.fast + s.slow === b.length - 1);
  const p = L.parseBlock(b[0]);
  assert.equal(p.height, b[0].height);
  assert.ok(p.reward >= L.subsidy(p.height));
  assert.ok(p.fees >= 0);
  assert.equal(p.empty, false);
});
test('recorded mempool depth', () => {
  const m = fx('mempool.json');
  assert.ok(L.mempoolDepth(m) > 0);
});

test('Kraken ticker parsing from recorded messages', () => {
  const raw = (n) => fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
  assert.deepEqual(parseTicker(raw('kraken-ticker.json')), [{ cur: 'GBP', price: 45593.6, pct: -2.79 }]);
  assert.deepEqual(parseTicker(raw('kraken-subscribe.json')), []);
  assert.deepEqual(parseTicker('not json'), []);
  assert.deepEqual(
    parseTicker(
      JSON.stringify({
        channel: 'ticker',
        data: [
          { symbol: 'BTC/USD', last: -1 },
          { symbol: 'ETH/USD', last: 5 },
          { symbol: 'BTC/USD', last: 61000.5 },
        ],
      })
    ),
    [{ cur: 'USD', price: 61000.5, pct: null }]
  );
});

test('backup price feed (Coinbase) parsing: string numbers, 24 h change from the price a day ago', () => {
  const raw = (n) => fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
  const [t] = parseBackupTicker(raw('coinbase-ticker.json'));
  assert.equal(t.cur, 'EUR');
  assert.equal(t.price, 52000.12);
  assert.ok(Math.abs(t.pct - 4.00024) < 1e-4);
  assert.deepEqual(parseBackupTicker(raw('coinbase-subscriptions.json')), []);
  assert.deepEqual(parseBackupTicker('not json'), []);
  assert.deepEqual(parseBackupTicker(JSON.stringify({ type: 'ticker', product_id: 'ETH-USD', price: '3000' })), []);
  assert.deepEqual(parseBackupTicker(JSON.stringify({ type: 'ticker', product_id: 'BTC-USD', price: '-1' })), []);
  assert.deepEqual(parseBackupTicker(JSON.stringify({ type: 'ticker', product_id: 'BTC-USD', price: '61000.5' })), [
    { cur: 'USD', price: 61000.5, pct: null },
  ]);
  assert.ok(BACKUP_CURRENCIES.every((c) => CURRENCIES.includes(c)));
});

test('watched addresses: shapes and bech32 checksums; payments net of spends; only new ones reported', () => {
  const A = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
  assert.equal(L.normAddress(' ' + A.toUpperCase() + ' '), A);
  assert.equal(L.normAddress(A.slice(0, -1) + 'x'), '', 'a typo fails the checksum');
  assert.equal(L.normAddress('bc1Qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'), '', 'mixed case');
  assert.equal(
    L.normAddress('bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297'),
    'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297'
  ); // taproot (bech32m)
  assert.equal(
    L.normAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'),
    'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
  );
  assert.equal(L.normAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  assert.equal(L.normAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'), '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
  for (const bad of ['', 'hello', '0A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'a'.repeat(64)])
    assert.equal(L.normAddress(bad), '');
  assert.equal(L.shortAddr(A), 'bc1qar0s…wf5mdq');
  const o = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const tx = (id, outs, ins, h) => ({
    txid: id,
    vin: ins.map(([a, value]) => ({ prevout: { scriptpubkey_address: a, value } })),
    vout: outs.map(([a, value]) => ({ scriptpubkey_address: a, value })),
    status: h ? { confirmed: true, block_height: h } : { confirmed: false },
  });
  assert.equal(
    L.addrReceived(
      tx(
        'x',
        [
          [A, 5],
          [A, 7],
          [o, 1],
        ],
        [[o, 20]]
      ),
      A
    ),
    12
  );
  assert.equal(L.addrReceived(tx('x', [[A, 5]], [[A, 50]]), A), -45);
  const old = tx('a', [[A, 1000]], [[o, 2000]], 10),
    spend = tx(
      'b',
      [
        [o, 900],
        [A, 50],
      ],
      [[A, 1000]]
    ),
    pay = tx('c', [[A, 12345000]], [[o, 20000000]]);
  let r = L.addrEvents(null, [old], A);
  assert.deepEqual(r, { seen: { a: 'c' }, events: [] }, 'first look: only noted');
  r = L.addrEvents(r.seen, [spend, pay, old], A);
  assert.deepEqual(r.events, [{ kind: 'in', txid: 'c', sats: 12345000, height: 0 }]);
  r = L.addrEvents(r.seen, [spend, pay, old], A);
  assert.deepEqual(r.events, [], 'once');
  r = L.addrEvents(r.seen, [tx('c', [[A, 12345000]], [[o, 20000000]], 12), old], A);
  assert.deepEqual(r.events, [{ kind: 'conf', txid: 'c', sats: 12345000, height: 12 }]);
  assert.deepEqual(L.addrEvents({}, [tx('d', [[A, 1]], [], 13)], A).events, [
    { kind: 'conf', txid: 'd', sats: 1, height: 13 },
  ]);
  assert.equal(L.fmtBtc(12345000), '0.12345');
  assert.equal(L.fmtBtc(100000000), '1');
  assert.equal(L.fmtBtc(1), '0.00000001');
});

test('long-term charts: daily grid, moving averages, Mayer Multiple, halving cycles, supply over time', () => {
  const D = 864e5;
  // a weekly series becomes one point per day, each day carrying the last price known by then
  const d = L.daily([
    { t: 0, v: 1 },
    { t: 7 * D, v: 2 },
    { t: 7 * D + 3600e3, v: 3 },
  ]);
  assert.equal(d.length, 8);
  assert.deepEqual([d[0].v, d[6].v, d[7].v], [1, 1, 3]);
  assert.deepEqual(
    L.movingAvg(
      [1, 2, 3, 4].map((v, i) => ({ t: i, v })),
      2
    ),
    [
      { t: 1, v: 1.5 },
      { t: 2, v: 2.5 },
      { t: 3, v: 3.5 },
    ]
  );
  // a flat price: the multiple is 1 everywhere
  const flat = Array.from({ length: 400 }, (_, i) => ({ t: i * D, v: 50 }));
  assert.ok(L.mayer(flat).every((p) => p.v === 1));
  assert.equal(L.mayer(flat).length, 201);
  // recorded weekly prices (mempool.space, one per week): every halving since 2012 has a cycle, starting at x1
  const pr = L.SERIES.price(fx('price-history-weekly.json'), 'USD');
  const w = L.ma200w(pr);
  assert.ok(w.length > 2000 && w.every((p) => p.v > 0));
  const cs = L.halvingCycles(pr, undefined, Date.UTC(2026, 10, 26));
  assert.deepEqual(
    cs.map((c) => c.year),
    [2012, 2016, 2020, 2024]
  );
  assert.ok(cs.every((c) => c.pts[0].t === 0 && c.pts[0].v === 1));
  assert.ok(cs[0].pts.length > 1300 && cs[0].pts.length < 1400, 'the 2012 cycle ends at the 2016 halving');
  assert.ok(cs[2].pts.at(-1).v > 3, 'the 2020 cycle ended well above its start');
  // supply from the difficulty adjustments: 50 BTC at the genesis block, never above 21 million
  const s = L.supplySeries(fx('hashrate-all-difficulty.json'));
  assert.equal(s[0].v, 50);
  assert.ok(s.every((p, i) => p.v <= 21e6 && (i === 0 || p.v >= s[i - 1].v)));
  assert.ok(s.at(-1).v > 19.9e6);
});

test('address page: balance, waiting in or out, everything received, transaction count', () => {
  assert.deepEqual(L.parseAddress(fx('address.json')), {
    balance: 100000000,
    pending: 1234500,
    received: 150000000,
    txs: 4,
  });
  assert.deepEqual(
    L.parseAddress({
      chain_stats: { funded_txo_sum: 300, spent_txo_sum: 100, tx_count: 3 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 50, tx_count: 1 },
    }),
    { balance: 200, pending: -50, received: 300, txs: 4 }
  );
  assert.deepEqual(L.parseAddress(null), { balance: 0, pending: 0, received: 0, txs: 0 });
});

test('speeding up a stuck transaction: replace at the new rate (at least 1 sat/vB more), or a follow-up pays for both', () => {
  const tx = { fee: 1128, vsize: 189 };
  assert.deepEqual(L.speedUp(tx, 20), { stuck: true, rbf: 3780, cpfp: 20 * (189 + L.CHILD_VB) - 1128 });
  assert.equal(L.speedUp(tx, 5).stuck, false); // 6 sat/vB already makes the next block
  assert.equal(L.speedUp({ fee: 1000, vsize: 200 }, 5.5).rbf, 1200); // the minimum step wins over 5.5 x 200
  assert.equal(L.speedUp({ fee: 100000, vsize: 200 }, 300).cpfp, 0 + Math.max(0, 300 * 310 - 100000));
  assert.equal(L.speedUp(tx, NaN), null);
  assert.equal(L.speedUp({ fee: 0, vsize: 0 }, 5), null);
});

test('block colours follow the mempool.space fee ramp', () => {
  assert.equal(L.FEE_BREAKS.length, L.FEE_COLORS.length);
  assert.equal(L.feeColor(0), '#007d3d');
  assert.equal(L.feeColor(0.5), '#007d3d');
  assert.equal(L.feeColor(1), '#557d00');
  assert.equal(L.feeColor(10), '#8c7d09');
  assert.equal(L.feeColor(5000), '#ae005b');
  assert.equal(L.MINED_TOP, '#9339f4');
  assert.equal(L.MINED_BOTTOM, '#105fb0');
  const pb = fx('mempool-blocks.json')[0];
  const bg = L.feeStripes(pb.feeRange);
  assert.ok(bg.startsWith('linear-gradient(to right') || bg.startsWith('#'));
  assert.equal(L.feeStripes([]), L.UPCOMING_EMPTY);
  assert.equal(L.feeStripes([3, 3.4]), L.feeColor(3));
});

test('every language has every label and no empty strings', () => {
  const en = Object.keys(TABLES.en).sort();
  assert.deepEqual(Object.keys(LANGS).sort(), Object.keys(TABLES).sort());
  for (const [l, tab] of Object.entries(TABLES)) {
    assert.deepEqual(Object.keys(tab).sort(), en, l);
    for (const v of Object.values(tab)) assert.ok(typeof v === 'string' && v.trim().length > 0, l);
  }
  assert.ok(Object.keys(TABLES).length >= 13);
});

test('browser language: an exact region first, then the language alone, else English', () => {
  assert.equal(detectLang('pt-BR'), 'pt-BR');
  assert.equal(detectLang('pt-br'), 'pt-BR');
  assert.equal(detectLang('pt-PT'), 'pt');
  assert.equal(detectLang('pt'), 'pt');
  assert.equal(detectLang('zh-CN'), 'zh');
  assert.equal(detectLang('zh-TW'), 'zh');
  assert.equal(detectLang('ko-KR'), 'ko');
  assert.equal(detectLang('ru'), 'ru');
  assert.equal(detectLang('id-ID'), 'id');
  assert.equal(detectLang('vi-VN'), 'vi');
  assert.equal(detectLang('hi-IN'), 'hi');
  assert.equal(detectLang('pl-PL'), 'pl');
  assert.equal(detectLang('uk-UA'), 'uk');
  assert.equal(detectLang('ar-EG'), 'ar');
  assert.equal(detectLang('fa-IR'), 'fa');
  assert.equal(detectLang('he-IL'), 'he');
  assert.equal(detectLang('th-TH'), 'th');
  assert.equal(detectLang('cs-CZ'), 'cs');
  assert.equal(detectLang('sv-SE'), 'sv');
  assert.equal(detectLang('da-DK'), 'da');
  assert.equal(detectLang('nb-NO'), 'nb');
  assert.equal(detectLang('fi-FI'), 'fi');
  assert.equal(detectLang('hu-HU'), 'hu');
  assert.equal(detectLang('ro-RO'), 'ro');
  assert.equal(detectLang('el-GR'), 'el');
  assert.equal(detectLang('bn-BD'), 'bn');
  assert.equal(detectLang('ms-MY'), 'ms');
  assert.equal(detectLang('hr-HR'), 'hr');
  assert.equal(detectLang('ne-NP'), 'ne');
  assert.equal(detectLang('ka-GE'), 'ka');
  assert.equal(detectLang('lt-LT'), 'lt');
  assert.equal(detectLang('mk-MK'), 'mk');
  assert.equal(detectLang('sl-SI'), 'sl');
  assert.equal(detectLang('de_AT'), 'de');
  assert.equal(detectLang('xx-YY'), 'en');
});

test('languages load one at a time: English until another is fetched, unknown ones stay English', async () => {
  setLang('de');
  assert.equal(getLang(), 'en');
  assert.equal(t('calc'), TABLES.en.calc); // not loaded yet
  await loadLang('de');
  setLang('de');
  assert.equal(getLang(), 'de');
  assert.equal(t('calc'), TABLES.de.calc);
  await loadLang('xx');
  setLang('xx');
  assert.equal(getLang(), 'en');
  setLang('en');
});

test('Arabic reads right to left: texts start with a right-to-left mark and filled-in values are isolated', async () => {
  assert.ok(isRtl('ar') && isRtl('fa') && isRtl('he') && !isRtl('en') && !isRtl('he-xx'));
  await loadLang('ar');
  setLang('ar');
  assert.equal(t('calc'), '\u200f' + TABLES.ar.calc);
  const s = t('est', { d: '11/27/2026' });
  assert.ok(s.startsWith('\u200f') && s.includes('\u206811/27/2026\u2069'), JSON.stringify(s));
  setLang('en');
  assert.equal(t('est', { d: '11/27/2026' }), TABLES.en.est.replace('{d}', '11/27/2026')); // left-to-right languages unchanged
});

test('alarms: reached at or below the tip, waiting above it, nothing before the tip is known', () => {
  const list = [{ height: 100 }, { height: 101 }, { height: 102, label: 'x' }];
  const r = L.splitAlarms(list, 101);
  assert.deepEqual(
    r.hit.map((a) => a.height),
    [100, 101]
  );
  assert.deepEqual(
    r.rest.map((a) => a.height),
    [102]
  );
  assert.deepEqual(L.splitAlarms(list, NaN), { hit: [], rest: list });
  assert.deepEqual(L.splitAlarms(null, 5), { hit: [], rest: [] });
});

test('version number matches in the app (state.js), the offline cache name and the README', () => {
  const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const v = read('src/state.js').match(/VERSION = '([\d.]+)'/)[1];
  assert.ok(read('sw.js').includes(`'blockhorizon-v${v}'`), 'sw.js cache name');
  assert.ok(read('README.md').includes(`Version ${v}.`), 'README');
  assert.ok(read('CHANGELOG.md').includes(`\n## ${v}\n`), 'CHANGELOG has a section for this version');
});

test('transactions: txid check, parse a confirmed and a waiting transaction', () => {
  assert.ok(L.isTxid(' 2bb85f4b004be6da54f766c17c1e855187327112c231ef2ff35ebad0ea67c69e '));
  assert.ok(!L.isTxid('840000'));
  assert.ok(!L.isTxid('zz'.repeat(32)));
  const c = L.parseTx(fx('tx-confirmed.json'), 840009);
  assert.deepEqual(
    [c.confirmed, c.height, c.confs, c.fee, c.vsize, c.ins, c.outs],
    [true, 840000, 10, 673200000, 187, 1, 2]
  );
  const m = L.parseTx(fx('tx-mempool.json'), 977411);
  assert.deepEqual([m.confirmed, m.confs, m.vsize], [false, 0, 189]);
  assert.ok(Math.abs(m.feeRate - 1128 / 189) < 1e-9);
});

test('transactions: inputs and outputs, and the privacy hints anyone can read from them', () => {
  const f = L.txFlow(fx('tx-mempool.json'));
  assert.deepEqual(
    f.ins.map((i) => [i.addr.slice(0, 8), i.value, i.type, i.vout]),
    [['bc1qel7t', 47293788, 'v0_p2wsh', 1]]
  );
  assert.deepEqual(
    f.outs.map((o) => [o.n, o.value, o.type]),
    [
      [0, 41897, 'v0_p2wpkh'],
      [1, 47250763, 'v0_p2wsh'],
    ]
  );
  // one P2WSH input, outputs P2WPKH and P2WSH: the one matching the input's type is likely the change
  assert.deepEqual(L.txPrivacy(fx('tx-mempool.json')), ['types']);
  // an op_return output is data, not a payment
  const c = L.txFlow(fx('tx-confirmed.json'));
  assert.deepEqual([c.outs[1].addr, c.outs[1].type], [null, 'op_return']);
  assert.deepEqual(L.txPrivacy(fx('tx-confirmed.json')), []);
  const tx = (ins, outs) => ({
    vin: ins.map(([a, v, ty = 'v0_p2wpkh']) => ({
      txid: 'aa',
      vout: 0,
      prevout: { scriptpubkey_address: a, value: v, scriptpubkey_type: ty },
    })),
    vout: outs.map(([a, v, ty = 'v0_p2wpkh']) => ({ scriptpubkey_address: a, value: v, scriptpubkey_type: ty })),
  });
  assert.deepEqual(
    L.txPrivacy(
      tx(
        [['A', 900000]],
        [
          ['B', 500000],
          ['A', 399000],
        ]
      )
    ),
    ['reuse', 'round']
  );
  assert.deepEqual(
    L.txPrivacy(
      tx(
        [
          ['A', 1],
          ['C', 2],
        ],
        [['B', 3]]
      )
    ),
    ['merge']
  );
  assert.deepEqual(
    L.txPrivacy(
      tx(
        [['A', 3e6]],
        [
          ['B', 1234567],
          ['D', 1765432, 'v1_p2tr'],
        ]
      )
    ),
    ['types']
  );
  assert.deepEqual(
    L.txPrivacy(
      tx(
        [['A', 3e6]],
        [
          ['B', 1234567],
          ['D', 1765432],
        ]
      )
    ),
    []
  ); // nothing stands out
  assert.deepEqual(L.txPrivacy({ vin: [{ is_coinbase: true }], vout: [{ value: 1 }] }), []); // new coins: nothing to say
  assert.deepEqual(L.txFlow({ vin: [{ is_coinbase: true }], vout: [] }).ins, [{ coinbase: true }]);
  assert.ok(L.isRoundSats(5e6) && !L.isRoundSats(5e6 + 1) && !L.isRoundSats(0));
});

test('a past block as a picture: slices of its space by fee rate, highest at the bottom', () => {
  const sum = [
    { txid: 'cb', fee: 0, vsize: 300, rate: 0 }, // the coinbase: left out
    { txid: 'lo', fee: 2e5, vsize: 2e5, rate: 1 },
    { txid: 'hi', fee: 3e6, vsize: 3e5, rate: 10 },
  ];
  const p = L.blockCells(sum, 4, 4); // 16 cells of 62,500 vB (the block's room is 1,000,000 vB)
  assert.deepEqual(
    p.list.map((x) => x.txid),
    ['hi', 'lo']
  );
  assert.equal(p.unit, 62500);
  // 500,000 vB used: the 8 bottom cells; 'hi' (300,000 vB) covers the middles of the first 5 (the 5th's is at
  // 4.5 x 62,500 = 281,250 vB), counted from the bottom left
  const row = (r) => p.cells.slice(r * 4, r * 4 + 4);
  assert.deepEqual(row(3), [0, 0, 0, 0]);
  assert.deepEqual(row(2), [0, 1, 1, 1]);
  assert.deepEqual(row(1), [-1, -1, -1, -1]);
  assert.deepEqual(row(0), [-1, -1, -1, -1]);
  // a full block uses every cell; an empty one (only the coinbase) none
  const full = L.blockCells([{ txid: 'a', fee: 1, vsize: 2e6, rate: 5 }], 3, 3);
  assert.ok(full.cells.every((c) => c === 0) && full.unit === 2e6 / 9);
  assert.ok(L.blockCells([{ txid: 'cb', fee: 0, vsize: 200, rate: 0 }], 3, 3).cells.every((c) => c === -1));
  assert.deepEqual(L.blockCells(null, 2, 2).cells, [-1, -1, -1, -1]);
});

test('transactions: place in the queue of projected blocks', () => {
  const proj = [{ feeRange: [5, 10] }, { feeRange: [2, 4] }, { medianFee: 1 }];
  assert.equal(L.txQueuePos(6, proj), 0);
  assert.equal(L.txQueuePos(3, proj), 1);
  assert.equal(L.txQueuePos(1, proj), 2);
  assert.equal(L.txQueuePos(0.5, proj), -1);
  assert.equal(L.txQueuePos(9, null), -1);
});

test('payment size: common address types, at least one input and output', () => {
  assert.equal(L.txVsize(1, 2), 141);
  assert.equal(L.txVsize(1, 1), 110);
  assert.equal(L.txVsize(2, 2), 209);
  assert.equal(L.txVsize(1, 2, 'taproot'), 154);
  assert.equal(L.txVsize(1, 2, 'legacy'), 226);
  assert.equal(L.txVsize(0, 0), L.txVsize(1, 1));
});

test('translations: same {placeholders} as English, and every key the app uses exists', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const [l, tab] of Object.entries(TABLES))
    for (const [k, v] of Object.entries(tab)) assert.equal(ph(v), ph(TABLES.en[k]), `${l}.${k}`);
  const app = fs
    .readdirSync(new URL('../src/', import.meta.url))
    .filter((f) => f.endsWith('.js') && f !== 'i18n.js')
    .map((f) => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'))
    .join('\n');
  const used = new Set([...app.matchAll(/\bt\(\s*'(\w+)'/g)].map((m) => m[1]));
  for (const m of app.matchAll(/\[\s*'\/[\w/]*',\s*'(\w+)',?\s*\]/g)) used.add(m[1]); // menu entries
  for (const k of ['minedAbout', 'estimated', 'tab_display', 'tab_format', 'tab_sounds']) used.add(k); // picked at run time
  for (const k of used) if (!k.endsWith('_')) assert.ok(TABLES.en[k], 'missing key ' + k);
});

test('offline cache lists every source file', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const f of fs.readdirSync(new URL('../src/', import.meta.url)).filter((x) => x.endsWith('.js')))
    assert.ok(sw.includes(`'src/${f}'`), 'sw.js is missing src/' + f);
  // English is always needed; the other languages are saved when first used, not downloaded up front
  assert.ok(sw.includes("'src/lang/en.js'"));
  assert.ok(!sw.includes("'src/lang/de.js'"));
});

test('fee alerts: reached at or below the limit for the chosen speed; nothing without fee data', () => {
  const fees = fx('fees.json'),
    list = [
      { level: 'next', max: fees.fastestFee },
      { level: 'next', max: fees.fastestFee - 0.5 },
      { level: 'h1', max: fees.hourFee + 1 },
      { level: 'h30', max: 0.01 },
    ];
  const r = L.splitFeeAlerts(list, fees);
  assert.deepEqual(r.hit, [list[0], list[2]]);
  assert.deepEqual(r.rest, [list[1], list[3]]);
  assert.deepEqual(L.splitFeeAlerts(list, null), { hit: [], rest: list });
  assert.equal(L.parseFeeLimit(' 2,5 '), 2.5);
  assert.ok(Number.isNaN(L.parseFeeLimit('0')));
  assert.ok(Number.isNaN(L.parseFeeLimit('abc')));
});

test('glossary and anniversaries: every language has every entry, none empty', () => {
  for (const l of Object.keys(LANGS).filter((x) => x !== 'en')) {
    assert.equal(GLOSSARY_TR[l]?.length, GLOSSARY.length, 'glossary ' + l);
    assert.equal(ANNIV_TR[l]?.length, ANNIVERSARIES.length, 'anniversaries ' + l);
    for (const [k, v] of GLOSSARY_TR[l]) assert.ok(k.trim() && v.trim().length > 20, l + ' ' + k);
    for (const x of ANNIV_TR[l]) assert.ok(x.trim(), l);
  }
});

test('history charts: series from recorded responses, ascending, missing values dropped', () => {
  const pr = L.SERIES.price(fx('price-history.json'), 'USD');
  assert.ok(pr.length > 1000 && pr.every((p, i) => i === 0 || p.t > pr[i - 1].t) && pr.every((p) => p.v > 0));
  assert.deepEqual(
    L.SERIES.price(
      {
        prices: [
          { time: 2, USD: -1 },
          { time: 1, USD: 5 },
        ],
      },
      'USD'
    ),
    [{ t: 1000, v: 5 }]
  );
  const hr = L.SERIES.hashrate(fx('hashrate-1y.json')),
    df = L.SERIES.difficulty(fx('hashrate-1y.json')),
    fe = L.SERIES.fees(fx('feerates-1m.json'));
  assert.ok(hr.length > 300 && df.length > 20 && fe.length > 100);
  assert.ok(fe.some((p) => p.v === 0) || fe.every((p) => p.v >= 0));
});

test('history charts: date range, thinning, ticks, nearest point', () => {
  const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i * 864e5, v: i + 1 })),
    now = 999 * 864e5;
  assert.equal(L.inRange(pts, '1m', now).length, 31);
  assert.equal(L.inRange(pts, 'all', now).length, 1000);
  const th = L.thin(pts, 100);
  assert.equal(th.length, 100);
  assert.equal(th[0], pts[0]);
  assert.equal(th[99], pts[999]);
  assert.equal(L.thin(pts.slice(0, 5), 100).length, 5);
  assert.deepEqual(L.ticks(0, 100, false), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(L.ticks(3, 47, false), [10, 20, 30, 40]);
  assert.deepEqual(L.ticks(0.05, 120000, true), [0.1, 1, 10, 100, 1000, 10000, 100000]);
  assert.deepEqual(L.ticks(15, 600, true), [20, 50, 100, 200, 500]);
  assert.equal(L.nearest(pts, 10.4 * 864e5), 10);
  assert.equal(L.nearest(pts, -5), 0);
  assert.equal(L.nearest(pts, 1e15), 999);
  assert.equal(L.nearest([], 1), -1);
});

test('history charts: trailing day average', () => {
  const pts = [0, 1, 2, 3, 4].map((d) => ({ t: d * 864e5, v: d % 2 ? 10 : 0 }));
  assert.deepEqual(
    L.smoothDays(pts, 2).map((p) => p.v),
    [0, 5, 5, 5, 5]
  );
  assert.equal(L.smoothDays(pts, 0), pts);
  assert.deepEqual(
    L.smoothDays(pts, 1).map((p) => p.v),
    [0, 10, 0, 10, 0]
  );
});

test('every page file the offline cache lists is published by the Pages workflow', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'),
    wf = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const cp = (wf.match(/cp -r ([^\n]+) _site\//) || [])[1].split(/\s+/);
  const files = JSON.parse(
    sw
      .match(/const FILES = (\[[^\]]+\])/)[1]
      .replace(/'/g, '"')
      .replace(/,\s*\]$/, ']')
  ); // the list may end with a comma
  for (const f of files.filter((x) => x !== './'))
    assert.ok(cp.includes(f.split('/')[0]), f + ' is cached but not published');
});

test('your block: dates, milestones, future height, price that week', () => {
  assert.equal(L.noonTs('2016-05-14'), 1463227200);
  assert.ok(Number.isNaN(L.noonTs('2016-02-30')));
  assert.ok(Number.isNaN(L.noonTs('14.05.2016')));
  assert.ok(Number.isNaN(L.noonTs('')));
  assert.deepEqual(L.nextMilestone(42), { blocks: 100, inBlocks: 58 });
  assert.deepEqual(L.nextMilestone(5000), { blocks: 6000, inBlocks: 1000 });
  assert.deepEqual(L.nextMilestone(65691), { blocks: 70000, inBlocks: 4309 });
  assert.deepEqual(L.nextMilestone(565691), { blocks: 600000, inBlocks: 34309 });
  assert.equal(L.heightAt(1000 + 6000, 900000, 1000 * 1000), 900010);
  const hp = fx('price-history.json'),
    ts = 1699963200;
  const p = L.priceAt(hp, 'USD', ts);
  const near = hp.prices.filter((x) => x.time <= ts).sort((a, b) => b.time - a.time)[0];
  assert.equal(p, near.USD);
  assert.equal(L.priceAt({ prices: [{ time: 100, USD: 5 }] }, 'USD', 50), 5);
  assert.ok(Number.isNaN(L.priceAt({ prices: [] }, 'USD', 50)));
});

test('mining: block time, chance, target, pool shares, big numbers', () => {
  const hr = fx('hashrate.json'),
    m = L.expectedBlockSec(hr.currentDifficulty, hr.currentHashrate);
  assert.ok(m > 500 && m < 620, String(m));
  assert.equal(L.expectedBlockSec(0, 0), 600);
  assert.ok(Math.abs(L.chanceWithin(600, 600) - (1 - Math.exp(-1))) < 1e-12);
  assert.equal(L.chanceWithin(0, 600), 0);
  const tg = L.miningTarget(hr.currentDifficulty);
  assert.equal(tg.length, 64);
  assert.equal(L.leadingZeros(tg), 19);
  assert.equal(L.miningTarget(1), '00000000ffff0000000000000000000000000000000000000000000000000000');
  assert.equal(L.miningTarget(0), null);
  const top = fx('blocks.json')[0];
  assert.ok(
    BigInt('0x' + top.id) <= BigInt('0x' + L.miningTarget(top.difficulty)),
    'a real block hash is below its target'
  );
  const sh = L.poolShares(fx('pools-1w.json'));
  assert.equal(sh.length, 7);
  assert.equal(sh[6].name, null);
  assert.ok(Math.abs(sh.reduce((a, p) => a + p.share, 0) - 1) < 1e-9);
  assert.ok(sh[0].share >= sh[1].share);
  assert.deepEqual(L.poolShares(null), []);
  assert.equal(L.fmtSci(4.1e23), '4.1 × 10²³');
  assert.equal(L.fmtSci(9.96e20), '1.0 × 10²¹');
  assert.equal(L.fmtSci(12345), '12,345');
  assert.equal(L.fmtSci(NaN), '–');
});

test('mining: live block frames apply (full list, then deltas) and pack without overlaps', () => {
  const frames = fx('projected-txs.json'),
    map = new Map();
  L.applyBlockFrame(map, frames[0]);
  assert.equal(map.size, frames[0].blockTransactions.length);
  for (const f of frames.slice(1)) L.applyBlockFrame(map, f);
  for (const f of frames.slice(1)) {
    for (const id of f.delta.removed)
      if (!frames.slice(1).some((g) => g !== f && g.delta.added.some((r) => r[0] === id)))
        assert.ok(!map.has(id), 'removed ' + id);
  }
  const x = [...map.values()][0];
  assert.ok(x.id.length === 64 && x.vsize > 0 && Number.isFinite(x.rate));
  const big = [];
  for (let i = 0; i < 12; i++) for (const t of map.values()) big.push(Object.assign({}, t, { id: t.id + i }));
  for (const [list, g] of [
    [[...map.values()], 75],
    [big, 100],
  ]) {
    const p = L.packBlock(list, g),
      seen = new Set();
    let area = 0;
    assert.equal(p.length, list.length, 'everything placed');
    for (const q of p) {
      assert.ok(q.x >= 0 && q.y >= 0 && q.x + q.s <= g && q.y + q.s <= g);
      area += q.s * q.s;
      for (let j = q.y; j < q.y + q.s; j++)
        for (let i = q.x; i < q.x + q.s; i++) {
          const k = j * g + i;
          assert.ok(!seen.has(k), 'overlap');
          seen.add(k);
        }
    }
    assert.ok(p[0].rate >= p[p.length - 1].rate, 'highest fee rates first');
    if (list === big) assert.ok(area / g / g > 0.8, 'a full block fills the square: ' + area / g / g);
  }
  const ap = L.approxBlock(fx('mempool-blocks.json')[0], 5);
  assert.equal(ap.length, 3870);
  assert.deepEqual(L.approxBlock(fx('mempool-blocks.json')[0], 5).slice(0, 3), ap.slice(0, 3), 'stable');
  assert.deepEqual(L.approxBlock(null), []);
});

test('mining: new transactions join a drawn block without moving anything, near their fee band', () => {
  const frames = fx('projected-txs.json'),
    map = L.applyBlockFrame(new Map(), frames[0]),
    list = [...map.values()];
  const lay = L.packBlock(list.slice(0, 300), 75),
    before = JSON.stringify(lay);
  const r = L.fitInto(lay, list.slice(300), 75, lay.unit);
  assert.equal(JSON.stringify(lay), before, 'placed squares untouched');
  assert.equal(r.placed.length + r.left.length, list.length - 300);
  const all = [...lay, ...r.placed],
    seen = new Set();
  for (const q of all)
    for (let j = q.y; j < q.y + q.s; j++)
      for (let i = q.x; i < q.x + q.s; i++) {
        const k = j * 75 + i;
        assert.ok(!seen.has(k), 'overlap');
        seen.add(k);
      }
  const low = r.placed.filter((p) => p.rate <= lay[lay.length - 1].rate);
  assert.ok(
    low.every((p) => p.y >= lay[lay.length - 1].y),
    'low fees go above the existing ones'
  );
  assert.ok(lay.unit > 0);
  assert.equal(L.fitInto(lay, [], 75, lay.unit).placed.length, 0);
});

test('trading chart: Kraken REST and websocket candles, merging, timeframes', () => {
  const h = L.parseKrakenRest(fx('kraken-ohlc-rest.json'));
  assert.equal(h.length, 300);
  assert.ok(
    h.every((k, i) => !i || k.t - h[i - 1].t === 36e5),
    'hourly, ascending'
  );
  assert.ok(h.every((k) => k.l <= Math.min(k.o, k.c) && k.h >= Math.max(k.o, k.c) && k.v >= 0));
  assert.deepEqual(L.parseKrakenRest({ error: ['EQuery:Unknown asset pair'] }), []);
  assert.deepEqual(L.parseKrakenRest(null), []);
  const snap = L.parseOhlc(fs.readFileSync(new URL('./fixtures/kraken-ohlc-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(snap.type, 'snapshot');
  assert.equal(snap.cur, 'USD');
  assert.equal(snap.interval, 60);
  assert.equal(snap.candles.length, 10);
  const upd = L.parseOhlc(fs.readFileSync(new URL('./fixtures/kraken-ohlc-update.json', import.meta.url), 'utf8'));
  assert.equal(upd.type, 'update');
  assert.equal(upd.candles[0].t, Date.parse('2026-11-25T04:00:00Z'));
  assert.equal(L.parseOhlc(fs.readFileSync(new URL('./fixtures/kraken-ticker.json', import.meta.url), 'utf8')), null);
  assert.equal(L.parseOhlc('nope'), null);
  // the newest candle is replaced in place, a new one appended, an old one fills its gap, and the series is capped
  const k = (t, c) => ({ t, o: c, h: c, l: c, c, v: 1 });
  let s = [k(1, 10), k(3, 30)];
  s = L.mergeCandles(s, [k(3, 31)]);
  assert.deepEqual(
    s.map((x) => x.c),
    [10, 31]
  );
  s = L.mergeCandles(s, [k(4, 40), k(2, 20)]);
  assert.deepEqual(
    s.map((x) => x.t),
    [1, 2, 3, 4]
  );
  assert.deepEqual(
    L.mergeCandles(s, [k(5, 50)], 3).map((x) => x.t),
    [3, 4, 5]
  );
  assert.equal(L.krakenPair('EUR'), 'XBTEUR');
  assert.deepEqual(Object.values(L.TIMEFRAMES), [1, 5, 15, 60, 240, 1440, 10080]);
  assert.equal(L.timeStep(60, 9), 720);
  assert.equal(L.timeStep(1, 9), 15);
  assert.equal(L.timeStep(1440, 9), 43200);
  assert.equal(L.onStep(Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 1, 23), 1440, true), true);
  assert.equal(L.onStep(Date.UTC(2026, 0, 2, 5), Date.UTC(2026, 0, 2, 4), 1440, true), false);
  assert.equal(L.onStep(Date.UTC(2026, 1, 1), Date.UTC(2026, 0, 31), 43200, true), true);
  assert.equal(L.fmtDate(Date.UTC(2026, 0, 2, 3, 4, 5), { utc: true, timeOnly: true, sec: true }), '03:04:05');
});
test('indicators: SMA, EMA and Wilder RSI', () => {
  assert.deepEqual(L.sma([1, 2, 3, 4, 5], 3), [NaN, NaN, 2, 3, 4]);
  const e = L.ema([1, 2, 3, 4, 5], 3);
  assert.ok(Number.isNaN(e[1]));
  assert.equal(e[2], 2);
  assert.equal(e[3], 3);
  assert.equal(e[4], 4);
  assert.deepEqual(L.ema([1, 2], 3).every(Number.isNaN), true);
  assert.equal(L.rsi([1, 2, 3, 4, 5, 6], 3)[5], 100);
  assert.equal(L.rsi([6, 5, 4, 3, 2, 1], 3)[5], 0);
  // classic Wilder example (StockCharts): 70.53 there, from averages rounded to 2 places; 70.46 unrounded
  const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  assert.ok(Math.abs(L.rsi(c, 14)[14] - 70.5) < 0.1, String(L.rsi(c, 14)[14]));
});
test('indicators: Bollinger Bands and MACD', () => {
  const b = L.bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2); // population standard deviation 2, mean 5
  assert.equal(b.mid[7], 5);
  assert.equal(b.up[7], 9);
  assert.equal(b.lo[7], 1);
  assert.ok(Number.isNaN(b.up[6]));
  const flat = L.macd(new Array(60).fill(100));
  assert.equal(flat.macd[59], 0);
  assert.equal(flat.signal[59], 0);
  assert.equal(flat.hist[59], 0);
  const m = L.macd(Array.from({ length: 60 }, (_, i) => 100 + i)); // a steady rise: MACD positive, signal defined from index 25 + 8
  assert.ok(m.macd[59] > 0);
  assert.ok(Number.isNaN(m.signal[32]) && Number.isFinite(m.signal[33]));
});
test('order book: snapshot, update, Kraken checksum, depth', () => {
  const r = (n) => fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
  const s = L.parseBook(r('kraken-book-snapshot.json')),
    u = L.parseBook(r('kraken-book-update.json'));
  assert.equal(s.type, 'snapshot');
  assert.equal(s.cur, 'USD');
  assert.equal(s.bids.length, 10);
  let b = L.applyBook(null, s);
  assert.ok(
    b.bids[0].p > b.bids[1].p && b.asks[0].p < b.asks[1].p && b.bids[0].p < b.asks[0].p,
    'best first, not crossed'
  );
  assert.equal(L.bookChecksum(b, 1), s.checksum);
  b = L.applyBook(b, u);
  assert.equal(L.bookChecksum(b, 1), u.checksum, 'still in step with Kraken after an update');
  const g = L.applyBook(
    {
      bids: [
        { p: 10, q: 1 },
        { p: 9, q: 1 },
      ],
      asks: [{ p: 11, q: 1 }],
    },
    {
      type: 'update',
      bids: [
        { p: 10, q: 0 },
        { p: 9.5, q: 2 },
      ],
      asks: [
        { p: 12, q: 1 },
        { p: 13, q: 1 },
      ],
    },
    2
  );
  assert.deepEqual(
    g,
    {
      bids: [
        { p: 9.5, q: 2 },
        { p: 9, q: 1 },
      ],
      asks: [
        { p: 11, q: 1 },
        { p: 12, q: 1 },
      ],
    },
    'a 0 amount removes, depth is kept'
  );
  assert.equal(L.crc32('123456789'), 0xcbf43926);
  assert.equal(L.pricePrecision('JPY'), 0);
  assert.equal(L.parseBook('{}'), null);
});
test('trades and price alerts', () => {
  const tr = L.parseTrades(fs.readFileSync(new URL('./fixtures/kraken-trade-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(tr.type, 'snapshot');
  assert.equal(tr.trades.length, 50);
  assert.ok(tr.trades.every((x) => (x.side === 'buy' || x.side === 'sell') && x.p > 0 && x.q > 0 && x.t > 0));
  assert.equal(
    L.parseTrades(fs.readFileSync(new URL('./fixtures/kraken-ohlc-update.json', import.meta.url), 'utf8')),
    null
  );
  const list = [
    { id: 'a', cur: 'USD', price: 60000, dir: 'up' },
    { id: 'b', cur: 'USD', price: 58000, dir: 'down' },
    { id: 'c', cur: 'EUR', price: 50000, dir: 'up' },
  ];
  assert.deepEqual(
    L.splitPriceAlerts(list, { USD: 60000.1, EUR: 49000 }).hit.map((a) => a.id),
    ['a']
  );
  assert.deepEqual(
    L.splitPriceAlerts(list, { USD: 57000 }).hit.map((a) => a.id),
    ['b']
  );
  assert.deepEqual(L.splitPriceAlerts(list, {}).rest.length, 3);
  assert.equal(L.alertDir(61000, 60000), 'up');
  assert.equal(L.alertDir(59000, 60000), 'down');
  assert.deepEqual(
    ['60,000', '60.000,5', '59 500.5', '1,5', '1.234.567', '100.000', '60.5', 'abc', '0', '-5'].map(L.parsePriceInput),
    [60000, 60000.5, 59500.5, 1.5, 1234567, 100000, 60.5, NaN, NaN, NaN]
  );
});

test('data server: addresses are tidied, junk is refused', () => {
  assert.equal(normServer('mempool.example.com'), 'https://mempool.example.com');
  assert.equal(normServer('https://node.local:4080/'), 'https://node.local:4080');
  assert.equal(normServer('https://example.com/mempool/api/'), 'https://example.com/mempool');
  assert.equal(normServer('http://umbrel.local:3006'), 'http://umbrel.local:3006');
  assert.equal(normServer(''), '');
  assert.equal(normServer('ftp://x.org'), '');
  assert.equal(normServer('https://x.org/?a=1'), '');
  assert.equal(normServer('not a url'), '');
});
test('backup source: only the essentials map to blockstream.info, and its fee estimates read like mempool.space', () => {
  assert.deepEqual(esploraFor('/blocks/tip/height'), { path: '/blocks/tip/height' });
  assert.deepEqual(esploraFor('/v1/blocks'), { path: '/blocks' });
  assert.deepEqual(esploraFor('/v1/blocks/840000'), { path: '/blocks/840000' });
  assert.equal(esploraFor('/v1/fees/recommended').path, '/fee-estimates');
  assert.equal(esploraFor('/v1/difficulty-adjustment'), null);
  assert.equal(esploraFor('/v1/mining/pools/1w'), null);
  // a past block's list of transactions has a backup; its picture (mempool.space's summary) does not
  const h = '0'.repeat(64);
  assert.deepEqual(esploraFor('/block/' + h + '/txs/25'), { path: '/block/' + h + '/txs/25' });
  assert.equal(esploraFor('/v1/block/' + h + '/summary'), null);
  assert.equal(esploraFor('/v1/statistics/24h'), null, 'the mempool history is mempool.space only');
  assert.deepEqual(esploraFees({ 1: 12.34, 3: 8, 6: 5.06, 144: 0.4 }), {
    fastestFee: 12.3,
    halfHourFee: 8,
    hourFee: 5.1,
    economyFee: 1,
    minimumFee: 1,
  });
});
test('miner economics: revenue, fee share and hashprice from reward-stats', () => {
  const e = L.minerEconomics(fx('reward-stats.json'), 1e21);
  assert.equal(e.blocks, 144);
  assert.ok(e.reward > 4e10);
  assert.ok(e.feeShare > 0 && e.feeShare < 0.2);
  assert.equal(Math.round(e.perBlock), Math.round(e.reward / 144));
  assert.equal(Math.round(e.hashprice), Math.round(e.reward / 1e6));
  assert.equal(L.minerEconomics(null, 1), null);
  assert.ok(Number.isNaN(L.minerEconomics(fx('reward-stats.json'), 0).hashprice));
});
test('blocks from a refresh merge with the live ones: newest first, one per height, never losing a newer block', () => {
  const b = (h, tag) => ({ height: h, id: 'x' + h + (tag || '') });
  const live = [b(102), b(101), b(100)],
    rest = [b(101, 'r'), b(100, 'r'), b(99, 'r')];
  assert.deepEqual(
    L.mergeBlocks(live, rest).map((x) => x.id),
    ['x102', 'x101r', 'x100r', 'x99r']
  );
  assert.equal(
    L.mergeBlocks(
      [],
      Array.from({ length: 20 }, (_, i) => b(i))
    ).length,
    15
  );
});

test('mempool history by fee rate: bands, next block, stacked layers, how full compared with the range', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/statistics-24h.json', import.meta.url), 'utf8'));
  const h = L.mempoolHistory(raw);
  assert.equal(h.length, raw.length);
  assert.ok(
    h.every((p, i) => !i || p.t >= h[i - 1].t),
    'ascending'
  );
  assert.equal(h[0].b.length, L.FEE_BREAKS.length);
  const last = h[h.length - 1],
    src = raw.reduce((a, r) => (r.added > a.added ? r : a));
  assert.equal(last.t, src.added * 1000);
  assert.equal(
    last.v,
    src.vsizes.reduce((a, x) => a + x, 0)
  );
  assert.deepEqual(L.mempoolHistory(null), []);
  assert.deepEqual(L.mempoolHistory([{ added: 'x' }, { added: 5, vsizes: [3, -1] }]), [
    { t: 5000, v: 3, b: [3].concat(Array(L.FEE_BREAKS.length - 1).fill(0)) },
  ]);
  // next block: filled from the top band down until 1,000,000 vB
  const b = Array(L.FEE_BREAKS.length).fill(0);
  b[0] = 5e6;
  b[4] = 600000;
  b[10] = 300000;
  assert.equal(L.nextBlockBand(b), 0); // 300k at 15-20 and 600k at 4-5 make 900k: the block ends in the lowest band
  b[4] = 800000;
  assert.equal(L.nextBlockBand(b), 4); // now 1.1M from 4 sat/vB up
  assert.equal(L.FEE_BREAKS[L.nextBlockBand(b)], 4);
  assert.equal(L.nextBlockBand([1, 2, 3]), -1, 'everything fits');
  assert.equal(L.nextBlockBand(b, 100000), 10, 'a smaller block ends in the top band');
  // stacked layers: only bands that hold something, each top edge the running total
  const pts = [
    { t: 1, v: 3, b: [1, 0, 2] },
    { t: 2, v: 4, b: [0, 0, 4] },
  ];
  assert.deepEqual(L.bandLayers(pts), [
    { band: 0, top: [1, 0] },
    { band: 2, top: [3, 4] },
  ]);
  assert.equal(L.shareAbove(pts, 3), 50);
  assert.equal(L.shareAbove(pts, 4), 0);
  assert.ok(Number.isNaN(L.shareAbove([], 1)));
});

test('mining pools ranked by blocks found, and past difficulty adjustments with a summary', () => {
  const fxj = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
  const r = L.poolRanking(fxj('pools-1w.json'));
  assert.equal(r.total, 1086);
  assert.equal(r.rows.length, 16);
  assert.deepEqual(
    r.rows.slice(0, 2).map((p) => [p.rank, p.name, p.blocks]),
    [
      [1, 'Foundry USA', 247],
      [2, r.rows[1].name, 245],
    ]
  );
  assert.equal(r.half, 3, '247 + 245 + 173 is more than half of 1,086');
  assert.ok(Math.abs(r.rows.reduce((s, p) => s + p.share, 0) - 1) < 1e-9);
  assert.ok(Math.abs(r.rows[0].hashrate - (247 / 1086) * 970289438388090200000) < 1e6);
  assert.equal(r.rows.find((p) => p.empty).empty, 3);
  assert.equal(L.poolRanking({ pools: [] }), null);
  assert.equal(L.poolRanking(null), null);
  assert.ok(Number.isNaN(L.poolRanking({ pools: [{ name: 'A', blockCount: 1 }] }).rows[0].hashrate));
  assert.equal(L.poolRanking({ pools: [{ name: 'A', blockCount: 1 }] }).half, 1);
  // adjustments: newest first, the genesis entry dropped, the ratio as a change in %
  const raw = fxj('difficulty-adjustments.json'),
    a = L.diffAdjustments(raw);
  assert.equal(a.length, raw.length - 1);
  assert.equal(a[0].height, 975744);
  assert.equal(a[0].t, 1794632570000);
  assert.ok(Math.abs(a[0].change - -9.1267) < 1e-9);
  assert.ok(a.every((x) => x.height % 2016 === 0 && x.height > 0));
  assert.deepEqual(L.diffAdjustments('x'), []);
  const s = L.adjustSummary(a, a[2].t);
  assert.equal(s.n, 3);
  assert.equal(s.up + s.down, 3);
  assert.ok(Math.abs(s.maxDown - -9.1267) < 1e-9);
  assert.equal(s.maxUp, Math.max(a[0].change, a[1].change, a[2].change));
  assert.equal(L.adjustSummary(a, Date.now() + 1e12), null);
});

test('more long-term charts: Puell Multiple, hash ribbons and the difficulty ribbon', () => {
  const fxj = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
  const r = fxj('hashrate-all-difficulty.json'),
    price = L.SERIES.price(fxj('price-history-weekly.json'), 'USD');
  // issuance: blocks a day at the period's pace × subsidy × price
  const iv = L.issuanceValue(r, price);
  assert.ok(iv.length > 5000);
  const day = (s) => iv[L.nearest(iv, Date.parse(s))];
  // mid-2023: 6.25 BTC a block, about 144 blocks a day
  const mid23 = day('2023-06-15'),
    p23 = L.daily(price)[L.nearest(L.daily(price), Date.parse('2023-06-15'))].v;
  assert.ok(Math.abs(mid23.v / p23 / 6.25 - 144) < 15, 'blocks a day: ' + mid23.v / p23 / 6.25);
  // after the 2024 halving the same pace issues half as much
  const late24 = day('2024-09-15'),
    p24 = L.daily(price)[L.nearest(L.daily(price), Date.parse('2024-09-15'))].v;
  assert.ok(Math.abs(late24.v / p24 / 3.125 - 144) < 15);
  assert.deepEqual(L.issuanceValue({ difficulty: [] }, price), []);
  // Puell: known tops and bottoms
  const pu = L.puell(r, price),
    at = (s) => pu[L.nearest(pu, Date.parse(s))].v;
  assert.ok(at('2017-12-17') > 4, 'late 2017 top: ' + at('2017-12-17'));
  assert.ok(at('2018-12-15') < 0.5, 'late 2018 bottom: ' + at('2018-12-15'));
  assert.equal(pu[0].t - iv[0].t, 364 * 864e5, 'starts after a full year');
  // hash ribbons: 30- and 60-day averages, which side the short one is on, and since when
  const hr = L.hashRibbons(r);
  assert.equal(hr.short.length - hr.long.length, 30);
  const lastS = hr.short[hr.short.length - 1].v,
    lastL = hr.long[hr.long.length - 1].v;
  assert.equal(hr.down, lastS < lastL);
  assert.ok(hr.since <= hr.long[hr.long.length - 1].t && hr.since >= hr.long[0].t);
  const flat = {
    hashrates: Array.from({ length: 100 }, (_, i) => ({ timestamp: 1e9 + i * 86400, avgHashrate: i < 80 ? 100 : 50 })),
  };
  const fr = L.hashRibbons(flat);
  assert.equal(fr.down, true, 'a drop pulls the 30-day average under the 60-day one');
  assert.equal(fr.since, Math.floor((1e9 + 80 * 86400) / 86400) * 864e5, 'from the day the drop began');
  assert.equal(L.hashRibbons({ hashrates: [] }).down, false);
  // difficulty ribbon: 8 averages, their spread on the last day
  const dr = L.diffRibbon(r);
  assert.deepEqual(
    dr.lines.map((l) => l.days),
    [9, 14, 25, 40, 60, 90, 128, 200]
  );
  assert.equal(dr.lines[0].pts.length - dr.lines[7].pts.length, 191);
  const last = dr.lines.map((l) => l.pts[l.pts.length - 1].v);
  assert.ok(Math.abs(dr.spread - (Math.max(...last) / Math.min(...last) - 1) * 100) < 1e-9);
  assert.ok(Number.isNaN(L.diffRibbon({}).spread));
  // the last two years of a series
  const two = L.lastDays(dr.diff, 730);
  assert.equal(two.length, 731);
  assert.deepEqual(L.lastDays([], 5), []);
});

test('block history: fees per block, fees as a share of miner income, block size', () => {
  const fxj = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8'));
  const fees = fxj('blockfees-1m.json'),
    rewards = fxj('blockrewards-1m.json'),
    sizes = fxj('blocksizes-1m.json');
  const bf = L.SERIES.blockFees(fees);
  assert.equal(bf.length, fees.length);
  assert.ok(bf.every((p, i) => !i || p.t >= bf[i - 1].t));
  assert.equal(bf[0].v, fees[0].avgFees / 1e8);
  assert.deepEqual(L.SERIES.blockFees([{ timestamp: 1, avgFees: 0 }]), [{ t: 1000, v: 0 }], 'no fees is a real value');
  assert.deepEqual(L.SERIES.blockFees(null), []);
  const bs = L.SERIES.blockSizes(sizes);
  assert.equal(bs.length, sizes.sizes.length);
  assert.ok(bs.every((p) => p.v > 0.5 && p.v < 4.1), 'blocks weigh at most 4 MWU, so stay under 4 MB');
  assert.deepEqual(L.SERIES.blockSizes({}), []);
  // the share: fees / (subsidy + fees), matched by height
  const sh = L.feeShareSeries(fees, rewards);
  assert.equal(sh.length, fees.length);
  const r0 = rewards.reduce((a, q) =>
    Math.abs(q.avgHeight - fees[0].avgHeight) < Math.abs(a.avgHeight - fees[0].avgHeight) ? q : a
  );
  assert.ok(Math.abs(sh[0].v - (fees[0].avgFees / r0.avgRewards) * 100) < 1e-9);
  assert.ok(sh.every((p) => p.v >= 0 && p.v < 5), 'fees are a few % of 3.125 BTC blocks now');
  assert.deepEqual(
    L.feeShareSeries([{ avgHeight: 10, timestamp: 2, avgFees: 50 }], [{ avgHeight: 11, avgRewards: 200 }]),
    [{ t: 2000, v: 25 }]
  );
  assert.deepEqual(L.feeShareSeries(fees, []), []);
});
