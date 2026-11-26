// "Mining": the next block, being mined, live. The block picture (block-scene.js: every waiting transaction that is in it,
// as it fills), the race (hashes tried so far, a stream of tries against the target), what is in it, when it is likely to
// be found and who is likely to find it (each pool's share of last week's blocks). Repainted on every live update.
import * as L from './lib.js';
import { api } from './api.js';
import { t, isRtl, getLang } from './i18n.js';
import { S, st, el, price, hooks, save, toast, fmtD } from './state.js';
import { kv, sinceText } from './ui.js';
import { sceneStats, setMark, sceneHas } from './block-scene.js';
import { play } from './sound.js';

// The transaction someone follows (#/mining?tx=…): looked up again after every new block, so the moment it is mined shows.
const follow = { id: '', info: null, err: false, tip: NaN, at: 0, waited: false, busy: false };
function lookUp(id) {
  const fresh =
    id === follow.id &&
    follow.tip === st.tip &&
    (follow.err || (follow.info && (follow.info.confirmed || Date.now() - follow.at < 20000)));
  if (follow.busy || fresh) return; // waiting ones are looked up again every 20 s too (a block can take a moment to show as confirmed)
  if (id !== follow.id) Object.assign(follow, { id, info: null, err: false, waited: false });
  follow.busy = true;
  const tip = st.tip;
  api
    .tx(id)
    .then(
      (x) => {
        if (follow.id !== id) return;
        const i = L.parseTx(x, st.tip);
        follow.info = i;
        follow.err = false;
        if (!i.confirmed) follow.waited = true;
      },
      () => {
        if (follow.id === id) {
          follow.err = true;
          follow.info = null;
        }
      }
    )
    .finally(() => {
      follow.busy = false;
      if (follow.id === id) {
        follow.tip = tip;
        follow.at = Date.now();
        hooks.render();
      }
    });
}
function followBox(id) {
  const input = el('input', {
    id: 'mf-tx',
    type: 'text',
    value: id,
    spellcheck: 'false',
    autocomplete: 'off',
    placeholder: t('mineTrackPh'),
    'aria-label': t('mineTrackPh'),
  });
  const go = (e) => {
    e.preventDefault();
    const v = input.value.trim().toLowerCase();
    if (!L.isTxid(v)) {
      toast(t('notTxid'));
      return;
    }
    location.hash = '#/mining?tx=' + v;
  };
  let status = null;
  if (id) {
    const i = follow.id === id ? follow.info : null,
      inBlock = sceneHas(id);
    const line = (cls, text) => el('p', { class: 'fstatus ' + cls, role: 'status' }, text);
    if (i && i.confirmed)
      status =
        follow.waited && i.height === st.tip
          ? line('ok big2', t('txJustMined', { n: L.fmtNum(i.height) }))
          : line('ok', t('txMinedIn', { n: L.fmtNum(i.height), c: L.fmtNum(i.confs) }));
    else if (inBlock) status = line('accent', t('txInBlock') + (i ? ' · ' + L.fmtFee(i.feeRate) + ' sat/vB' : ''));
    else if (i) {
      const q = st.proj && st.proj.length ? L.txQueuePos(i.feeRate, st.proj) : -1;
      status = line(
        '',
        q > 0
          ? t('txNotInBlock', { f: L.fmtFee(i.feeRate), n: q })
          : q === 0
            ? t('txInBlock')
            : t('txTooLow', { f: L.fmtFee(i.feeRate) })
      );
    } else if (follow.id === id && follow.err) status = line('bad', t('notFound'));
    else status = line('dim', t('loading'));
    status = [
      status,
      el(
        'p',
        { class: 'row flinks' },
        el('a', { href: '#/tx/' + id }, t('txDetails') + ' →'),
        el('a', { href: '#/mining' }, t('mineStop'))
      ),
    ];
  }
  return el(
    'form',
    { class: 'follow', onsubmit: go },
    el('label', { for: 'mf-tx', class: 'eyebrow' }, t('mineTrack')),
    el('div', { class: 'frow' }, input, el('button', { class: 'btn-go', type: 'submit' }, t('mineWatch'))),
    status
  );
}
// A bell drawn as SVG (emoji differ per system); the slash shows while the sound is off (styled from aria-pressed).
function bellIcon() {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    width: 16,
    height: 16,
    'aria-hidden': 'true',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: 'ico',
  }))
    svg.setAttribute(k, v);
  for (const [d, c] of [
    ['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', ''],
    ['M10 21h4', ''],
    ['M4 4l16 16', 'slash'],
  ]) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    if (c) p.setAttribute('class', c);
    svg.append(p);
  }
  return svg;
}
function soundButton() {
  return el(
    'button',
    {
      class: 'soundbtn',
      type: 'button',
      'aria-pressed': S.sound ? 'true' : 'false',
      title: t('soundNew'),
      onclick: (e) => {
        S.sound = !S.sound;
        save();
        e.currentTarget.setAttribute('aria-pressed', String(S.sound));
        if (S.sound) play(S.bsound);
      },
    },
    bellIcon(),
    t('soundNew')
  );
}

let pools = null,
  rewards = null,
  poolsAt = 0,
  poolsNa = false,
  rewardsNa = false;
function loadPools() {
  // once per 10 minutes while the page is open; a failure retries after a minute
  if (Date.now() - poolsAt < 600000) return;
  poolsAt = Date.now();
  // a server that answers 4xx does not offer mining statistics (a node without mining indexing): say so instead of "Loading…"
  const na = (e) => !!(e && e.status >= 400 && e.status < 500);
  api
    .pools()
    .then((v) => {
      pools = v;
      poolsNa = false;
      hooks.render();
    })
    .catch((e) => {
      poolsNa = na(e) && !pools;
      poolsAt = Date.now() - 540000;
      hooks.render();
    });
  api
    .rewards()
    .then((v) => {
      rewards = v;
      rewardsNa = false;
      hooks.render();
    })
    .catch((e) => {
      rewardsNa = na(e) && !rewards;
      hooks.render();
    });
}
// The pool ranking (its own range; the week is the `pools` above) and the past difficulty adjustments (every
// adjustment, newest first: loaded once an hour). Which range, and how many rows are shown, live here, since the page
// is redrawn in place (morph) and keeps the first element's click handlers.
const RANK_RANGES = { '24h': 'r24h', '1w': 'r1w', '1m': 'r1m', '1y': 'r1y' };
const ranked = {}; // range -> { v, at, na }
let rankAll = false,
  adj = null,
  adjAt = 0,
  adjNa = false,
  adjShown = 10;
// another data server (Settings): forget this one's figures, so the page shows the new server's, or says it has none
export function resetMining() {
  pools = rewards = adj = null;
  poolsAt = adjAt = 0;
  poolsNa = rewardsNa = adjNa = false;
  for (const k of Object.keys(ranked)) delete ranked[k];
}
const rankRange = () => (RANK_RANGES[S.poolRange] ? S.poolRange : '1w');
function loadRank(r) {
  if (r === '1w') return;
  const c = ranked[r] || (ranked[r] = { v: null, at: 0, na: false });
  if (Date.now() - c.at < 600000) return;
  c.at = Date.now();
  api.poolsIn(r).then(
    (v) => {
      c.v = v;
      c.na = false;
      hooks.render();
    },
    (e) => {
      c.na = !c.v && !!(e && e.status >= 400 && e.status < 500);
      c.at = Date.now() - 540000;
      hooks.render();
    }
  );
}
function loadAdj() {
  if (Date.now() - adjAt < 3600000) return;
  adjAt = Date.now();
  api.adjustments().then(
    (v) => {
      adj = v;
      adjNa = false;
      hooks.render();
    },
    (e) => {
      adjNa = !adj && !!(e && e.status >= 400 && e.status < 500);
      adjAt = Date.now() - 3540000;
      hooks.render();
    }
  );
}
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
// '▲ +5.54%', kept left to right as a whole inside a right-to-left sentence (the arrow stays before the number)
const signed = (c) => {
  const s = (c > 0 ? '▲ +' : c < 0 ? '▼ ' : '') + c.toFixed(2) + '%';
  return isRtl(getLang()) ? '\u2066' + s + '\u2069' : s;
};
function rankPanel() {
  const r = rankRange();
  loadRank(r);
  const c = r === '1w' ? { v: pools, na: poolsNa } : ranked[r] || {},
    rk = L.poolRanking(c.v),
    rows = rk ? (rankAll ? rk.rows : rk.rows.slice(0, 10)) : [];
  return el(
    'section',
    { class: 'panel', id: 'pool-rank' },
    el('h2', null, t('poolRank')),
    el(
      'div',
      { class: 'tabs mprange', role: 'group', 'aria-label': t('rangeL') },
      Object.keys(RANK_RANGES).map((k) =>
        el(
          'button',
          {
            'data-pr': k,
            'aria-pressed': String(k === r),
            onclick: () => {
              S.poolRange = k;
              save();
              rankAll = false;
              hooks.render();
            },
          },
          t(RANK_RANGES[k])
        )
      )
    ),
    rk
      ? [
          el('p', null, t('poolRankSum', { b: L.fmtNum(rk.total), n: L.fmtNum(rk.rows.length), k: L.fmtNum(rk.half) })),
          el(
            'div',
            { class: 'tscroll' },
            el(
              'table',
              { class: 'ranktable' },
              el(
                'thead',
                null,
                el(
                  'tr',
                  null,
                  el('th', { scope: 'col', class: 'num' }, '#'),
                  el('th', { scope: 'col' }, t('poolL')),
                  el('th', { scope: 'col', class: 'num' }, t('blocksL')),
                  el('th', { scope: 'col', class: 'num' }, t('shareL')),
                  el('th', { scope: 'col', class: 'num opt' }, t('hashrateEst'))
                )
              ),
              el(
                'tbody',
                null,
                rows.map((p) =>
                  el(
                    'tr',
                    null,
                    el('td', { class: 'num dim' }, L.fmtNum(p.rank)),
                    el('th', { scope: 'row' }, p.name),
                    el('td', { class: 'num' }, L.fmtNum(p.blocks)),
                    el('td', { class: 'num' }, pct(p.share)),
                    el('td', { class: 'num opt' }, L.fmtHashrate(p.hashrate))
                  )
                )
              )
            )
          ),
          rk.rows.length > 10
            ? el(
                'button',
                {
                  class: 'morebtn',
                  'aria-expanded': String(rankAll),
                  onclick: () => {
                    rankAll = !rankAll;
                    hooks.render();
                  },
                },
                rankAll ? t('showFewer') : t('showAllPools', { n: L.fmtNum(rk.rows.length) })
              )
            : null,
          el('p', { class: 'dim note' }, t('poolRankNote')),
        ]
      : el('p', { class: 'dim' }, c.na ? t('naServer') : t('loading'))
  );
}
function adjPanel() {
  loadAdj();
  const all = L.diffAdjustments(adj),
    rows = all.slice(0, adjShown),
    sum = L.adjustSummary(all, Date.now() - 365.25 * 864e5);
  return el(
    'section',
    { class: 'panel', id: 'adjustments' },
    el('h2', null, t('adjTitle')),
    all.length
      ? [
          sum
            ? el(
                'p',
                null,
                t('adjSum', {
                  n: L.fmtNum(sum.n),
                  u: L.fmtNum(sum.up),
                  d: L.fmtNum(sum.down),
                  a: signed(sum.maxUp),
                  b: signed(sum.maxDown),
                })
              )
            : null,
          el(
            'div',
            { class: 'tscroll' },
            el(
              'table',
              { class: 'ranktable' },
              el(
                'thead',
                null,
                el(
                  'tr',
                  null,
                  el('th', { scope: 'col' }, t('dateL')),
                  el('th', { scope: 'col', class: 'num' }, t('blockL')),
                  el('th', { scope: 'col', class: 'num' }, t('diffChart')),
                  el('th', { scope: 'col', class: 'num' }, t('changeL'))
                )
              ),
              el(
                'tbody',
                null,
                rows.map((a) =>
                  el(
                    'tr',
                    null,
                    el('td', null, fmtD(a.t, { dateOnly: true })),
                    el('td', { class: 'num' }, el('a', { href: '#/block/' + a.height }, L.fmtNum(a.height))),
                    el('td', { class: 'num' }, L.fmtDifficulty(a.diff)),
                    el('td', { class: 'num' }, signed(a.change))
                  )
                )
              )
            )
          ),
          all.length > adjShown
            ? el(
                'button',
                {
                  class: 'morebtn',
                  onclick: () => {
                    adjShown += 20;
                    hooks.render();
                  },
                },
                t('showEarlier', { n: L.fmtNum(Math.min(20, all.length - adjShown)) })
              )
            : null,
          el('p', { class: 'dim note' }, t('adjNote')),
        ]
      : el('p', { class: 'dim' }, adjNa ? t('naServer') : t('loading'))
  );
}

const still = () =>
  S.reduced || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
function randomHash() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const TRIES = 5;
let tries = [];
// A hash with its leading zeros picked out, so the target, the tries and the last winning hash line up for comparison.
const hashEl = (hex, cls = '') => {
  const z = L.leadingZeros(hex);
  return el('code', { class: 'hash ' + cls }, el('span', { class: 'z' }, hex.slice(0, z)), hex.slice(z));
};
const fiat = (sats) => {
  const p = price();
  return Number.isFinite(p) && Number.isFinite(sats) ? ' · ' + L.fmtNum((sats / 1e8) * p, 0) + ' ' + S.cur : '';
};
const btc = (sats) => (Number.isFinite(sats) ? L.satsToBtc(sats, 3) + ' BTC' + fiat(sats) : '–');

function inputs(now = Date.now()) {
  const b0 = st.blocks[0],
    d = (st.hr && st.hr.currentDifficulty) || (b0 && b0.difficulty),
    hr = st.hr && st.hr.currentHashrate;
  const elapsed = b0 ? Math.max(0, now / 1000 - b0.timestamp) : NaN;
  return { b0, d, hr, elapsed, mean: L.expectedBlockSec(d, hr), tries: hr > 0 ? hr * elapsed : NaN };
}
const longerText = (x) => (Number.isFinite(x.elapsed) ? Math.round(Math.exp(-x.elapsed / x.mean) * 100) + '%' : '–');
const tryRow = (h) => el('li', null, hashEl(h, 'miss'), el('span', { class: 'bad', 'aria-hidden': 'true' }, '✕'));

export function viewMining(arg = '') {
  const fid = (new URLSearchParams(arg).get('tx') || '').toLowerCase(),
    txId = L.isTxid(fid) ? fid : '';
  setMark(txId);
  if (txId) lookUp(txId);
  else follow.id = '';
  loadPools();
  while (tries.length < TRIES) tries.push(randomHash());
  const now = Date.now(),
    x = inputs(now),
    next = Number.isFinite(st.tip) ? st.tip + 1 : NaN,
    pb = st.proj && st.proj[0],
    sc = sceneStats();
  const b0 = x.b0 ? L.parseBlock(x.b0) : null,
    prev = st.blocks[1],
    gap = x.b0 && prev ? x.b0.timestamp - prev.timestamp : NaN,
    target = L.miningTarget(x.d);
  const root = el('div', { class: 'minegrid' }, el('h1', { class: 'sr-only' }, t('mineTitle')));

  const fr = pb && pb.feeRange && pb.feeRange.length ? pb.feeRange : null;
  root.append(
    el(
      'section',
      { class: 'panel minehead' },
      el(
        'figure',
        { class: 'scenebox' },
        el('div', {
          id: 'scene',
          'data-keep': '',
          role: 'img',
          'aria-label': t('sceneAria', { n: L.fmtNum(next), c: L.fmtNum(sc.n || (pb && pb.nTx) || 0) }),
        }),
        el(
          'figcaption',
          null,
          el(
            'span',
            null,
            t('sceneCap', {
              n: L.fmtNum(sc.n || (pb && pb.nTx) || 0),
              p: Math.min(100, Math.round((sc.vsize || (pb && pb.blockVSize) || 0) / 1e4)),
            })
          ),
          el('span', { class: sc.live ? 'ok' : 'dim' }, sc.live ? '● ' + t('live') : t('sceneApprox'))
        ),
        fr
          ? el(
              'div',
              { class: 'legend' },
              el('small', null, L.fmtFee(fr[0])),
              el('i', { class: 'stripe', style: `background:${L.feeStripes(fr)}` }),
              el('small', null, L.fmtFee(fr[fr.length - 1]) + ' sat/vB')
            )
          : null
      ),
      el(
        'div',
        { class: 'mineinfo' },
        el('div', { class: 'minetop' }, el('div', { class: 'eyebrow' }, t('mineEyebrow')), soundButton()),
        el('div', { class: 'myh', id: 'h' }, Number.isFinite(next) ? '#' + L.fmtNum(next) : '…'),
        el('p', { class: 'since' }, t('searching') + ': ', el('b', { id: 'since' }, sinceText(now))),
        // always present (hidden when there is nothing to say), so the elements after it keep their place across live updates
        // and the transaction field keeps what is typed in it and its focus
        x.elapsed < 90 && Number.isFinite(gap)
          ? el(
              'p',
              { class: 'found', role: 'status' },
              t('justFound', { n: L.fmtNum(b0.height), t: L.fmtDuration(gap) }) + (b0.pool ? ' · ' + b0.pool : '')
            )
          : el('p', { class: 'found', role: 'status', hidden: true }),
        followBox(txId),
        el(
          'div',
          { class: 'hasher' },
          el(
            'div',
            { class: 'hrow' },
            el('b', { id: 'tries', class: 'mono' }, L.fmtSci(x.tries)),
            el('span', { class: 'dim' }, ' ' + t('triesSoFar'))
          ),
          target
            ? [
                el('small', null, t('targetL')),
                hashEl(target, 'target'),
                el('small', null, t('aTry')),
                el('ol', { id: 'tries-list', 'aria-hidden': 'true', 'data-keep': '' }, tries.map(tryRow)),
              ]
            : null,
          target ? el('p', { class: 'dim note' }, t('targetNote', { n: L.leadingZeros(target) })) : null
        ),
        el('p', { class: 'dim note' }, t('mineIntro'))
      )
    )
  );

  const grid = el('div', { class: 'grid mgrid' });
  root.append(grid);
  grid.append(
    el(
      'section',
      { class: 'panel' },
      el('h2', null, t('inBlock')),
      pb
        ? [
            kv([
              [t('txs'), L.fmtNum(pb.nTx)],
              [t('size'), t('full', { p: Math.min(100, Math.round((pb.blockVSize || 0) / 1e4)) })],
              [t('medianFee'), L.fmtFee(pb.medianFee) + ' sat/vB'],
              [t('feeRange'), fr ? `${L.fmtFee(fr[0])} – ${L.fmtFee(fr[fr.length - 1])} sat/vB` : '–'],
              [t('mineFees'), btc(pb.totalFees)],
              [t('rewardIf'), Number.isFinite(next) ? btc(L.subsidy(next) + (pb.totalFees || 0)) : '–'],
            ]),
            el('p', { class: 'dim note' }, t('inBlockNote')),
          ]
        : el('p', { class: 'dim' }, t('loading'))
    )
  );

  const pc = (s) => Math.round(L.chanceWithin(s, x.mean) * 100) + '%';
  grid.append(
    el(
      'section',
      { class: 'panel' },
      el('h2', null, t('mineWhen')),
      el('p', { class: 'big' }, '~' + L.fmtDuration(x.mean)),
      el('p', { class: 'dim' }, t('meanEvery')),
      el(
        'div',
        { class: 'chips' },
        [1, 10, 30].map((m) =>
          el('div', { class: 'chip' }, el('small', null, t('withinMin', { n: m })), el('b', null, pc(m * 60)))
        )
      ),
      kv([[t('longer'), el('span', { id: 'longer' }, longerText(x))]]),
      el('p', { class: 'dim note' }, t('memoryless', { t: L.fmtDuration(x.mean) }))
    )
  );

  const sh = L.poolShares(pools);
  grid.append(
    el(
      'section',
      { class: 'panel' },
      el('h2', null, t('mineWho')),
      sh.length
        ? [
            el(
              'ol',
              { class: 'pools' },
              sh.map((p) =>
                el(
                  'li',
                  null,
                  el('span', null, p.name || t('otherPools')),
                  el('b', null, (p.share * 100).toFixed(1) + '%'),
                  el(
                    'i',
                    { class: 'bar-track' },
                    el('i', {
                      class: 'bar-fill' + (p.name ? '' : ' rest'),
                      style: `width:${((p.share / sh[0].share) * 100).toFixed(1)}%`,
                    })
                  )
                )
              )
            ),
            b0 && b0.pool ? el('p', null, t('lastBy', { p: b0.pool })) : null,
            el('p', { class: 'dim note' }, t('whoNote')),
          ]
        : el('p', { class: 'dim' }, poolsNa ? t('naServer') : t('loading'))
    )
  );

  // What miners earned over the last 144 blocks: revenue, the part from fees, and the hashprice (what 1 PH/s earns a day).
  const ec = L.minerEconomics(rewards, x.hr);
  grid.append(
    el(
      'section',
      { class: 'panel' },
      el('h2', null, t('mineDay')),
      ec
        ? [
            el('p', { class: 'big' }, L.satsToBtc(ec.reward, 2) + ' BTC'),
            el('p', { class: 'dim' }, t('mineDaySub', { n: L.fmtNum(ec.blocks) }) + fiat(ec.reward)),
            kv([
              [t('fromFees'), (ec.feeShare * 100).toFixed(ec.feeShare < 0.1 ? 2 : 1) + '%'],
              [t('avgBlock'), btc(ec.perBlock)],
              [t('txs'), L.fmtNum(ec.tx)],
              [
                t('hashprice'),
                Number.isFinite(ec.hashprice) ? L.fmtNum(ec.hashprice, 0) + ' sats' + fiat(ec.hashprice) : '–',
              ],
            ]),
            el('p', { class: 'dim note' }, t('mineDayNote')),
          ]
        : el('p', { class: 'dim' }, rewardsNa ? t('naServer') : t('loading'))
    )
  );

  grid.append(
    el(
      'section',
      { class: 'panel' },
      el('h2', null, t('mineSearch')),
      kv([
        [t('hashrate'), x.hr > 0 ? L.fmtHashrate(x.hr) : '–'],
        [t('hashesNeeded'), L.fmtSci(x.d * L.TWO32)],
      ]),
      b0 && b0.id
        ? el(
            'div',
            { class: 'hashes' },
            el('small', null, t('lastWin', { n: L.fmtNum(b0.height) })),
            el('a', { href: '#/block/' + b0.height, class: 'hashlink' }, hashEl(b0.id))
          )
        : null,
      el('p', { class: 'dim note' }, t('searchNote'))
    )
  );
  root.append(el('div', { class: 'grid mgrid2' }, rankPanel(), adjPanel()));
  return root;
}
// Each second: the hash count and the share of blocks that take longer. Four times a second (unless motion is reduced):
// a new try joins the stream at the top and the oldest drops off.
export function paintMining(now = Date.now()) {
  const e = document.getElementById('tries');
  if (!e) return;
  const x = inputs(now);
  e.textContent = L.fmtSci(x.tries);
  const lg = document.getElementById('longer');
  if (lg) lg.textContent = longerText(x);
}
setInterval(() => {
  const ol = typeof document !== 'undefined' && document.getElementById('tries-list');
  if (!ol || still() || document.hidden) return;
  tries = [randomHash(), ...tries].slice(0, TRIES);
  const row = tryRow(tries[0]);
  ol.prepend(row);
  while (ol.children.length > TRIES) ol.lastElementChild.remove();
  row.animate(
    [
      { opacity: 0, transform: 'translateY(-6px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 220, easing: 'ease-out' }
  );
}, 250);
