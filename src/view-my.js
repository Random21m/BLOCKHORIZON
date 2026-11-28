// "Your block": a date that matters to someone, placed on the chain. The date and name live only in the link
// (#/my?d=2016-05-14&l=My%20birthday), so a shared link reproduces the page and nothing is stored or sent anywhere
// except the public data requests (the block at that time, the price that week). An optional transaction
// (&tx=<id>, say the 10,000 BTC pizza payment on Pizza Day) gets a second card beside it: the block it was mined in and
// how many blocks it came after the day's block.
import * as L from './lib.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { S, st, fmtD, el, toast, price as priceNow } from './state.js';
import { kv, shareRow } from './ui.js';
import { shareNostr } from './nostr.js';

const params = (q) => {
  const p = new URLSearchParams(q || '');
  const tx = (p.get('tx') || '').trim().toLowerCase();
  return { d: p.get('d') || '', l: (p.get('l') || '').slice(0, 40), tx: L.isTxid(tx) ? tx : '' };
};
export const myLink = (d, l, tx) =>
  '/my?d=' + encodeURIComponent(d) + (l ? '&l=' + encodeURIComponent(l) : '') + (tx ? '&tx=' + tx : '');
// Pizza Day: 22 May 2010, when Laszlo Hanyecz paid 10,000 BTC for two pizzas (the transaction below, in block 57,043).
const PIZZA_TX = 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d';
export const PIZZA_LINK = myLink('2010-05-22', 'Bitcoin Pizza Day', PIZZA_TX);
const fmtDay = (ms) => fmtD(ms, { dateOnly: true, utc: true });
let token = 0;

export function viewMy(query) {
  const { d, l, tx } = params(query),
    tok = ++token;
  const di = el('input', { id: 'my-d', type: 'date', value: d, min: '2008-01-01', 'aria-label': t('myDate') });
  const li = el('input', {
    id: 'my-l',
    type: 'text',
    value: l,
    maxlength: 40,
    placeholder: t('myLabelPh'),
    'aria-label': t('myLabel'),
  });
  const ti = el('input', {
    id: 'my-tx',
    type: 'text',
    value: tx,
    maxlength: 64,
    spellcheck: 'false',
    autocomplete: 'off',
    placeholder: t('mineTrackPh'),
    'aria-label': t('myTx'),
  });
  const go = (e) => {
    e.preventDefault();
    if (!L.noonTs(di.value)) {
      toast(t('myBadDate'));
      return;
    }
    const id = ti.value.trim().toLowerCase();
    if (id && !L.isTxid(id)) {
      toast(t('notTxid'));
      return;
    }
    location.hash = '#' + myLink(di.value, li.value.trim(), id);
  };
  const out = el('div', { id: 'my-out' });
  const root = el(
    'div',
    null,
    el('h1', null, t('myTitle')),
    el('p', { class: 'dim' }, t('myIntro')),
    el(
      'form',
      { class: 'row', onsubmit: go },
      el('label', { for: 'my-d' }, t('myDate')),
      di,
      el('label', { for: 'my-l' }, t('myLabel')),
      li,
      el('label', { for: 'my-tx' }, t('myTx')),
      ti,
      el('button', { class: 'btn-go', type: 'submit' }, t('myFind'))
    ),
    el(
      'p',
      { class: 'dim' },
      t('myTry') + ' ',
      el('a', { id: 'my-pizza', href: '#' + PIZZA_LINK }, 'Bitcoin Pizza Day')
    ),
    out
  );
  let ts = L.noonTs(d);
  if (!ts) return root;
  const g0 = Math.floor(L.GENESIS_TS / 86400) * 86400;
  if (ts >= g0 && ts < L.GENESIS_TS) ts = L.GENESIS_TS; // 3 Jan 2009 is the genesis block's own day (mined at 18:15 UTC, after our noon)
  const name = l || t('myDefault'),
    now = Date.now();
  if (ts < L.GENESIS_TS) {
    out.append(
      el(
        'div',
        { class: 'panel' },
        el('div', { class: 'eyebrow' }, name),
        el(
          'p',
          { class: 'big' },
          ((n) => t(n === 1 ? 'myBefore1' : 'myBefore', { n: L.fmtNum(n) }))(
            Math.round((g0 - Math.floor(ts / 86400) * 86400) / 86400)
          )
        )
      )
    );
    return root;
  }
  if (ts * 1000 > now) {
    const h = Number.isFinite(st.tip) ? L.heightAt(ts, st.tip, now) : NaN;
    out.append(
      el(
        'div',
        { class: 'panel mycard' },
        el('div', { class: 'eyebrow' }, name),
        el('div', { class: 'myh' }, Number.isFinite(h) ? '#' + L.fmtNum(h) : '…'),
        el('p', null, t('myFuture', { d: fmtDay(ts * 1000) })),
        Number.isFinite(h)
          ? el(
              'p',
              { class: 'dim' },
              el('b', { id: 'my-since', 'data-to': h }, L.fmtNum(h - st.tip)),
              ' ' + t('blocksToGo')
            )
          : null,
        shareRow(myLink(d, l, tx), 'BLOCKHORIZON · ' + name)
      )
    );
    return root;
  }
  out.append(el('div', { class: 'panel' }, t('loading')));
  (async () => {
    try {
      const [b, pr, txr] = await Promise.all([
        api.byTime(ts),
        api.priceAt(S.cur, ts).catch(() => null),
        tx ? api.tx(tx).catch(() => null) : null,
      ]);
      if (tok !== token) return;
      const h = b.height,
        mined = Date.parse(b.timestamp) || ts * 1000,
        price = L.priceAt(pr, S.cur, ts);
      const since = Number.isFinite(st.tip) ? st.tip - h : NaN,
        ms = Number.isFinite(since) ? L.nextMilestone(since) : null;
      const card = { name, h, mined, since, reward: L.subsidy(h), pct: (L.supplyAt(h) / L.MAX_SATS) * 100, price };
      const dayCard = el(
        'div',
        { class: 'panel mycard' },
        el('div', { class: 'eyebrow' }, name),
        el('div', { class: 'myh' }, el('a', { href: '#/block/' + h }, '#' + L.fmtNum(h))),
        el('p', { class: 'dim' }, t('minedOn', { d: fmtD(mined, { utc: true }) })),
        kv(
          [
            [
              t('blocksSince'),
              el('b', { id: 'my-since', 'data-from': h }, Number.isFinite(since) ? L.fmtNum(since) : '…'),
            ],
            ms
              ? [
                  t('nextMilestone'),
                  t('milestoneAt', { n: L.fmtNum(ms.blocks), d: fmtDay(now + ms.inBlocks * L.TARGET_SEC * 1000) }),
                ]
              : null,
            [t('rewardThen'), L.satsToBtc(card.reward, 8).replace(/\.?0+$/, '') + ' BTC'],
            [t('issuedThen'), t('issuedPct', { p: card.pct.toFixed(1) })],
            Number.isFinite(price)
              ? [t('priceThen'), t('priceAbout', { p: L.fmtNum(price, price < 100 ? 2 : 0) + ' ' + S.cur })]
              : null,
          ].filter(Boolean)
        ),
        shareRow(myLink(d, l, tx), 'BLOCKHORIZON · ' + name),
        el(
          'p',
          { class: 'row' },
          el('button', { id: 'my-img', onclick: () => saveImage(card) }, t('saveImage')),
          el(
            'button',
            {
              id: 'my-nostr',
              onclick: async () => {
                const url = location.href.split('#')[0] + '#' + myLink(d, l, tx);
                // the link goes in after t(), so no right-to-left isolate mark sticks to it (a client would link it)
                const text = t('nostrText', {
                  name,
                  n: L.fmtNum(h),
                  d: fmtDay(mined),
                  s: Number.isFinite(since) ? L.fmtNum(since) : '…',
                  u: '\u0000',
                }).replace(/\u2068?\u0000\u2069?/, () => url);
                const r = await shareNostr(text);
                toast(
                  r.how === 'posted'
                    ? t('nostrPosted', { n: r.relays })
                    : r.how === 'copied'
                      ? t('nostrCopied')
                      : t('nostrFailed')
                );
              },
            },
            t('nostrShare')
          )
        )
      );
      out.replaceChildren(tx ? el('div', { class: 'mypair' }, dayCard, txCard(tx, txr, h)) : dayCard);
    } catch {
      if (tok === token) out.replaceChildren(el('div', { class: 'panel' }, t('notFound')));
    }
  })();
  return root;
}

// The second card: the transaction, the block it is in and how far that is from the day's block (dayH).
function txCard(id, r, dayH) {
  const head = el(
    'div',
    { class: 'eyebrow' },
    el('a', { href: '#/tx/' + id, class: 'mono', title: id }, t('txTitle') + ' ' + id.slice(0, 8) + '…' + id.slice(-6))
  );
  if (!r) return el('div', { class: 'panel mycard mytx' }, head, el('p', null, t('notFound')));
  const moved = (r.vout || []).reduce((a, o) => a + (o.value || 0), 0),
    now = priceNow(),
    s = r.status || {};
  const btc = (sats) => L.satsToBtc(sats, 8).replace(/\.?0+$/, '') + ' BTC';
  if (!s.confirmed)
    return el(
      'div',
      { class: 'panel mycard mytx' },
      head,
      el('div', { class: 'myh' }, '…'),
      el('p', { class: 'dim' }, t('waiting')),
      kv([[t('myTxMoved'), btc(moved)]])
    );
  const h = s.block_height,
    gap = h - dayH;
  return el(
    'div',
    { class: 'panel mycard mytx' },
    head,
    el('div', { class: 'myh' }, el('a', { href: '#/block/' + h }, '#' + L.fmtNum(h))),
    el('p', { class: 'dim' }, t('minedOn', { d: fmtD(s.block_time * 1000, { utc: true }) })),
    kv(
      [
        gap === 0
          ? [t('myTxSame'), '✓']
          : [t(gap > 0 ? 'myTxAfter' : 'myTxBefore'), el('b', null, L.fmtNum(Math.abs(gap)))],
        [t('myTxMoved'), btc(moved)],
        Number.isFinite(now) ? [t('myTxWorthNow'), L.fmtNum((moved / 1e8) * now, 0) + ' ' + S.cur] : null,
      ].filter(Boolean)
    )
  );
}

// Keep "blocks since" (or "blocks to go") live: called on every data update from app.js.
export function paintMySince() {
  const e = document.getElementById('my-since');
  if (!e || !Number.isFinite(st.tip)) return;
  const from = +e.dataset.from,
    to = +e.dataset.to,
    n = Number.isFinite(from) && e.dataset.from ? st.tip - from : to - st.tip,
    s = L.fmtNum(Math.max(0, n));
  if (e.textContent !== s) e.textContent = s;
}

// A 1200x630 card to post anywhere (made in the browser, nothing uploaded). Shared as a file where the system allows it,
// downloaded otherwise.
async function saveImage(c) {
  const cv = document.createElement('canvas');
  cv.width = 1200;
  cv.height = 630;
  const g = cv.getContext('2d');
  const light = document.documentElement.dataset.theme === 'light',
    bg = light ? '#F3EEE2' : '#0E0D0C',
    ink = light ? '#16130F' : '#EAE3D2',
    dim = light ? '#5D574E' : '#8C857A',
    acc = light ? '#8E2A1F' : '#E06A55';
  const mono = '"SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    sans = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  g.fillStyle = bg;
  g.fillRect(0, 0, 1200, 630);
  g.strokeStyle = light ? '#C9C0AD' : '#3A3631';
  g.lineWidth = 2;
  g.strokeRect(40, 40, 1120, 550);
  g.strokeStyle = acc;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(104, 104, 22, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(80, 114);
  g.lineTo(128, 114);
  g.stroke();
  g.fillStyle = acc;
  g.beginPath();
  g.arc(104, 114, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ink;
  g.font = `700 26px ${sans}`;
  g.textBaseline = 'middle';
  g.fillText('B L O C K H O R I Z O N', 144, 106);
  g.fillStyle = dim;
  g.font = `600 30px ${sans}`;
  g.textBaseline = 'alphabetic';
  g.fillText(c.name.toLocaleUpperCase(document.documentElement.lang), 80, 230);
  g.fillStyle = acc;
  g.font = `700 150px ${mono}`;
  g.fillText('#' + L.fmtNum(c.h), 72, 380);
  g.fillStyle = ink;
  g.font = `400 34px ${sans}`;
  g.fillText(t('minedOn', { d: fmtDay(c.mined) }), 80, 450);
  g.fillStyle = dim;
  g.font = `400 28px ${sans}`;
  g.fillText(
    [
      Number.isFinite(c.since) ? t('imgBlocksAgo', { n: L.fmtNum(c.since) }) : '',
      t('imgReward', { r: L.satsToBtc(c.reward, 8).replace(/\.?0+$/, '') }),
    ]
      .filter(Boolean)
      .join(' · '),
    80,
    500
  );
  g.font = `400 24px ${sans}`;
  g.fillText((location.host + location.pathname).replace(/\/$/, ''), 80, 560);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
  const file = 'block-' + c.h + '.png';
  try {
    const f = new File([blob], file, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: 'BLOCKHORIZON · ' + c.name });
      return;
    }
  } catch {
    /* fall back to a download */
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: file });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
