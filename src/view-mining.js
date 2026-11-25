// "Mining": the next block, being mined, live. The block picture (block-scene.js: every waiting transaction that is in it,
// as it fills), the race (hashes tried so far, a stream of tries against the target), what is in it, when it is likely to
// be found and who is likely to find it (each pool's share of last week's blocks). Repainted on every live update.
import * as L from './lib.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { S, st, el, price, hooks } from './state.js';
import { kv, sinceText } from './ui.js';
import { sceneStats } from './block-scene.js';

let pools = null, poolsAt = 0;
function loadPools() { // once per 10 minutes while the page is open; a failure retries after a minute
  if (Date.now() - poolsAt < 600000) return; poolsAt = Date.now();
  api.pools().then((v) => { pools = v; hooks.render(); }).catch(() => { poolsAt = Date.now() - 540000; });
}
const still = () => S.reduced || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
function randomHash() { const a = new Uint8Array(32); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); }
const TRIES = 5; let tries = [];
// A hash with its leading zeros picked out, so the target, the tries and the last winning hash line up for comparison.
const hashEl = (hex, cls = '') => { const z = L.leadingZeros(hex); return el('code', { class: 'hash ' + cls }, el('span', { class: 'z' }, hex.slice(0, z)), hex.slice(z)); };
const fiat = (sats) => { const p = price(); return Number.isFinite(p) && Number.isFinite(sats) ? ' · ' + L.fmtNum(sats / 1e8 * p, 0) + ' ' + S.cur : ''; };
const btc = (sats) => Number.isFinite(sats) ? L.satsToBtc(sats, 3) + ' BTC' + fiat(sats) : '–';

function inputs(now = Date.now()) {
  const b0 = st.blocks[0], d = (st.hr && st.hr.currentDifficulty) || (b0 && b0.difficulty), hr = st.hr && st.hr.currentHashrate;
  const elapsed = b0 ? Math.max(0, now / 1000 - b0.timestamp) : NaN;
  return { b0, d, hr, elapsed, mean: L.expectedBlockSec(d, hr), tries: hr > 0 ? hr * elapsed : NaN };
}
const longerText = (x) => Number.isFinite(x.elapsed) ? Math.round(Math.exp(-x.elapsed / x.mean) * 100) + '%' : '–';
const tryRow = (h) => el('li', null, hashEl(h, 'miss'), el('span', { class: 'bad', 'aria-hidden': 'true' }, '✕'));

export function viewMining() {
  loadPools(); while (tries.length < TRIES) tries.push(randomHash());
  const now = Date.now(), x = inputs(now), next = Number.isFinite(st.tip) ? st.tip + 1 : NaN, pb = st.proj && st.proj[0], sc = sceneStats();
  const b0 = x.b0 ? L.parseBlock(x.b0) : null, prev = st.blocks[1], gap = x.b0 && prev ? x.b0.timestamp - prev.timestamp : NaN, target = L.miningTarget(x.d);
  const root = el('div', { class: 'minegrid' }, el('h1', { class: 'sr-only' }, t('mineTitle')));

  const fr = pb && pb.feeRange && pb.feeRange.length ? pb.feeRange : null;
  root.append(el('section', { class: 'panel minehead' },
    el('figure', { class: 'scenebox' },
      el('div', { id: 'scene', 'data-keep': '', role: 'img', 'aria-label': t('sceneAria', { n: L.fmtNum(next), c: L.fmtNum(sc.n || (pb && pb.nTx) || 0) }) }),
      el('figcaption', null,
        el('span', null, t('sceneCap', { n: L.fmtNum(sc.n || (pb && pb.nTx) || 0), p: Math.min(100, Math.round((sc.vsize || (pb && pb.blockVSize) || 0) / 1e4)) })),
        el('span', { class: sc.live ? 'ok' : 'dim' }, sc.live ? '● ' + t('live') : t('sceneApprox'))),
      fr ? el('div', { class: 'legend' }, el('small', null, L.fmtFee(fr[0])), el('i', { class: 'stripe', style: `background:${L.feeStripes(fr)}` }), el('small', null, L.fmtFee(fr[fr.length - 1]) + ' sat/vB')) : null),
    el('div', { class: 'mineinfo' },
      el('div', { class: 'eyebrow' }, t('mineEyebrow')), el('div', { class: 'myh', id: 'h' }, Number.isFinite(next) ? '#' + L.fmtNum(next) : '…'),
      el('p', { class: 'since' }, t('searching') + ': ', el('b', { id: 'since' }, sinceText(now))),
      x.elapsed < 90 && Number.isFinite(gap) ? el('p', { class: 'found', role: 'status' }, t('justFound', { n: L.fmtNum(b0.height), t: L.fmtDuration(gap) }) + (b0.pool ? ' · ' + b0.pool : '')) : null,
      el('div', { class: 'hasher' },
        el('div', { class: 'hrow' }, el('b', { id: 'tries', class: 'mono' }, L.fmtSci(x.tries)), el('span', { class: 'dim' }, ' ' + t('triesSoFar'))),
        target ? [el('small', null, t('targetL')), hashEl(target, 'target'), el('small', null, t('aTry')), el('ol', { id: 'tries-list', 'aria-hidden': 'true', 'data-keep': '' }, tries.map(tryRow))] : null,
        target ? el('p', { class: 'dim note' }, t('targetNote', { n: L.leadingZeros(target) })) : null),
      el('p', { class: 'dim note' }, t('mineIntro')))));

  const grid = el('div', { class: 'grid' }); root.append(grid);
  grid.append(el('section', { class: 'panel' }, el('h2', null, t('inBlock')), pb ? [
    kv([[t('txs'), L.fmtNum(pb.nTx)], [t('size'), t('full', { p: Math.min(100, Math.round((pb.blockVSize || 0) / 1e4)) })], [t('medianFee'), L.fmtFee(pb.medianFee) + ' sat/vB'],
      [t('feeRange'), fr ? `${L.fmtFee(fr[0])} – ${L.fmtFee(fr[fr.length - 1])} sat/vB` : '–'],
      [t('mineFees'), btc(pb.totalFees)], [t('rewardIf'), Number.isFinite(next) ? btc(L.subsidy(next) + (pb.totalFees || 0)) : '–']]),
    el('p', { class: 'dim note' }, t('inBlockNote'))] : el('p', { class: 'dim' }, t('loading'))));

  const pc = (s) => Math.round(L.chanceWithin(s, x.mean) * 100) + '%';
  grid.append(el('section', { class: 'panel' }, el('h2', null, t('mineWhen')), el('p', { class: 'big' }, '~' + L.fmtDuration(x.mean)), el('p', { class: 'dim' }, t('meanEvery')),
    el('div', { class: 'chips' }, [1, 10, 30].map((m) => el('div', { class: 'chip' }, el('small', null, t('withinMin', { n: m })), el('b', null, pc(m * 60))))),
    kv([[t('longer'), el('span', { id: 'longer' }, longerText(x))]]),
    el('p', { class: 'dim note' }, t('memoryless', { t: L.fmtDuration(x.mean) }))));

  const sh = L.poolShares(pools);
  grid.append(el('section', { class: 'panel' }, el('h2', null, t('mineWho')), sh.length ? [
    el('ol', { class: 'pools' }, sh.map((p) => el('li', null, el('span', null, p.name || t('otherPools')), el('b', null, (p.share * 100).toFixed(1) + '%'),
      el('i', { class: 'bar-track' }, el('i', { class: 'bar-fill' + (p.name ? '' : ' rest'), style: `width:${(p.share / sh[0].share * 100).toFixed(1)}%` }))))),
    b0 && b0.pool ? el('p', null, t('lastBy', { p: b0.pool })) : null,
    el('p', { class: 'dim note' }, t('whoNote'))] : el('p', { class: 'dim' }, t('loading'))));

  grid.append(el('section', { class: 'panel' }, el('h2', null, t('mineSearch')),
    kv([[t('hashrate'), x.hr > 0 ? L.fmtHashrate(x.hr) : '–'], [t('hashesNeeded'), L.fmtSci(x.d * L.TWO32)]]),
    b0 && b0.id ? el('div', { class: 'hashes' }, el('small', null, t('lastWin', { n: L.fmtNum(b0.height) })), el('a', { href: '#/block/' + b0.height, class: 'hashlink' }, hashEl(b0.id))) : null,
    el('p', { class: 'dim note' }, t('searchNote'))));
  return root;
}
// Each second: the hash count and the share of blocks that take longer. Four times a second (unless motion is reduced):
// a new try joins the stream at the top and the oldest drops off.
export function paintMining(now = Date.now()) {
  const e = document.getElementById('tries'); if (!e) return;
  const x = inputs(now); e.textContent = L.fmtSci(x.tries);
  const lg = document.getElementById('longer'); if (lg) lg.textContent = longerText(x);
}
setInterval(() => {
  const ol = typeof document !== 'undefined' && document.getElementById('tries-list'); if (!ol || still() || document.hidden) return;
  tries = [randomHash(), ...tries].slice(0, TRIES); const row = tryRow(tries[0]); ol.prepend(row); while (ol.children.length > TRIES) ol.lastElementChild.remove();
  row.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
}, 250);
