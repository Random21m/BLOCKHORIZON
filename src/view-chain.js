// Block, transaction and address pages.
import * as L from './lib.js';
import { api, store, lookupHost } from './api.js';
import { t, getLang, isRtl } from './i18n.js';
import { S, st, fmtD, el, price, txAlerts } from './state.js';
import { askNotify } from './data.js';
import { pushAvailable } from './push.js';
const pushOn = () => pushAvailable() && S.pushOn;
import { kv, shareRow } from './ui.js';

export let blockToken = 0;
export function viewBlock(hStr) {
  const root = el('div'),
    n = L.parseHeightInput(hStr),
    tok = ++blockToken;
  root.append(
    el('a', { class: 'back', href: '#/' }, '← ' + t('dash')),
    el('h1', null, t('blockH') + ' ' + (Number.isFinite(n) ? L.fmtNum(n) : '?'))
  );
  const body = el('div', { class: 'panel' }, t('loading'));
  root.append(body);
  if (!Number.isFinite(n)) {
    body.textContent = t('notFound');
    return root;
  }
  (async () => {
    try {
      const hash = (await api.hashAt(n)).trim(),
        raw = await api.block(hash);
      if (tok !== blockToken) return;
      const b = L.parseBlock(raw);
      body.replaceChildren(
        kv(
          [
            [t('hash'), b.id],
            [t('time'), fmtD(b.ts * 1000)],
            [t('txs'), L.fmtNum(b.txs)],
            [t('size'), L.fmtNum(b.size) + ' B'],
            [t('weight'), L.fmtNum(b.weight) + ' WU'],
            [t('medianFee'), L.fmtFee(b.medianFee) + ' sat/vB'],
            [
              t('feeRange'),
              b.feeRange.length
                ? `${L.fmtFee(b.feeRange[0])} – ${L.fmtFee(b.feeRange[b.feeRange.length - 1])} sat/vB`
                : '–',
            ],
            [t('subsidyFees'), `${L.satsToBtc(L.subsidy(b.height), 4)} + ${L.satsToBtc(b.fees, 4)} BTC`],
            [t('minedBy'), b.pool || '–'],
            [t('emptyBlock'), b.empty ? t('yes') : t('no')],
            b.height === 0 ? [t('special'), t('genesis')] : null,
          ].filter(Boolean)
        ),
        el(
          'div',
          { class: 'row' },
          n > 0 ? el('a', { href: '#/block/' + (n - 1) }, '← ' + L.fmtNum(n - 1)) : null,
          n < st.tip ? el('a', { href: '#/block/' + (n + 1) }, L.fmtNum(n + 1) + ' →') : null
        ),
        shareRow('/block/' + n, 'BLOCKHORIZON · ' + t('blockH') + ' ' + L.fmtNum(n))
      );
      root.append(blockHealthBox(raw, hash, tok), blockPicture(hash, tok), blockList(hash, b.txs, tok));
    } catch {
      if (tok === blockToken) body.textContent = t('notFound');
    }
  })();
  return root;
}
// How closely the block matched the one mempool.space expected from its own mempool: the match, the fees against the
// expected fees, and (from the audit) how many expected transactions were left out and how many unexpected ones are in
// it. Only mempool.space compares blocks; on the backup server or for older blocks the panel says it is not available.
function blockHealthBox(raw, hash, tok) {
  const body = el('div', null, el('p', { class: 'dim' }, t('loading'))),
    box = el('section', { class: 'panel', id: 'blk-health' }, el('h2', { class: 'sec' }, t('blkHealth')), body);
  const show = (audit) => {
    if (tok !== blockToken) return;
    const h = L.blockHealth(raw, audit);
    if (!h) return body.replaceChildren(el('p', { class: 'dim' }, t('blkHealthNone')));
    const btc = (v) => L.trimZeros(L.satsToBtc(v, 8)),
      diff = h.expected > 0 && Number.isFinite(h.fees) ? (h.fees / h.expected - 1) * 100 : NaN;
    body.replaceChildren(
      kv(
        [
          [t('blkMatch'), el('b', null, L.fmtNum(h.match, h.match % 1 ? 2 : 0) + '%')],
          Number.isFinite(h.expected) && Number.isFinite(h.fees)
            ? [
                t('blkFeesL'),
                t('blkFeesVs', {
                  a: btc(h.fees),
                  b: btc(h.expected),
                  c: Number.isFinite(diff)
                    ? (diff >= 0 ? '+' : '−') + L.fmtNum(Math.abs(diff), Math.abs(diff) < 1 ? 2 : 1) + '%'
                    : '–',
                }),
              ]
            : null,
          Number.isFinite(h.missing) ? [t('blkMissing'), L.fmtNum(h.missing)] : null,
          Number.isFinite(h.added)
            ? [
                t('blkAdded'),
                h.fresh > 0
                  ? t('blkAddedFresh', { n: L.fmtNum(h.added), f: L.fmtNum(Math.min(h.fresh, h.added)) })
                  : L.fmtNum(h.added),
              ]
            : null,
        ].filter(Boolean)
      ),
      el('p', { class: 'dim note' }, t('blkHealthNote'))
    );
  };
  api.blockAudit(hash).then(show, () => show(null));
  return box;
}
// What was in a past block: every transaction as a slice of the block's space, coloured by fee rate (highest at the
// bottom). Tapping a square opens its transaction. The picture needs mempool.space's block summary (the backup server
// has none); the list below works with either.
const PIC = 50; // cells across and down
function blockPicture(hash, tok) {
  const canvas = el('canvas', { class: 'blkpic', width: '500', height: '500', role: 'img' }),
    note = el('p', { class: 'dim' }, t('loading')),
    box = el('section', { class: 'panel', id: 'blk-pic' }, el('h2', { class: 'sec' }, t('blkPicture')), note);
  api.blockSummary(hash).then(
    (sum) => {
      if (tok !== blockToken) return;
      const p = L.blockCells(sum, PIC, PIC),
        rates = p.list.map((x) => x.rate).filter(Number.isFinite);
      canvas.setAttribute(
        'aria-label',
        t('blkPicAria', {
          n: L.fmtNum(p.list.length),
          lo: L.fmtFee(rates.length ? rates[rates.length - 1] : 0),
          hi: L.fmtFee(rates.length ? rates[0] : 0),
        })
      );
      const cx = canvas.getContext('2d'),
        sz = canvas.width / PIC,
        empty = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#333';
      p.cells.forEach((c, i) => {
        cx.fillStyle = c < 0 ? empty : L.feeColor(p.list[c].rate);
        cx.fillRect((i % PIC) * sz, Math.floor(i / PIC) * sz, sz - 1, sz - 1);
      });
      const at = (e) => {
        const r = canvas.getBoundingClientRect(),
          col = Math.floor(((e.clientX - r.left) / r.width) * PIC),
          row = Math.floor(((e.clientY - r.top) / r.height) * PIC),
          c = p.cells[row * PIC + col];
        return c >= 0 ? p.list[c] : null;
      };
      canvas.addEventListener('mousemove', (e) => {
        const x = at(e);
        canvas.title = x ? `${L.fmtFee(x.rate)} sat/vB · ${L.fmtNum(x.vsize)} vB` : '';
        canvas.style.cursor = x ? 'pointer' : '';
      });
      canvas.addEventListener('click', (e) => {
        const x = at(e);
        if (x) location.hash = '#/tx/' + x.txid;
      });
      note.textContent = t('blkPicNote');
      note.before(canvas);
    },
    () => {
      if (tok === blockToken) note.textContent = t('blkPicNone');
    }
  );
  return box;
}
// The block's transactions, 25 at a time (the data server's pages), each linked, with its fee rate and amount sent.
const PAGE = 25;
function blockList(hash, total, tok) {
  const tbody = el('tbody'),
    range = el('p', { class: 'dim', role: 'status' }),
    [back, fwd] = isRtl(getLang()) ? ['→', '←'] : ['←', '→'], // the arrows point the way the page reads
    prev = el('button', { id: 'blk-prev' }, back + ' ' + t('blkPrev', { n: PAGE })),
    next = el('button', { id: 'blk-next' }, t('blkNext', { n: PAGE }) + ' ' + fwd);
  let start = 0;
  const show = async () => {
    prev.disabled = next.disabled = true;
    try {
      const txs = await api.blockTxs(hash, start);
      if (tok !== blockToken) return;
      tbody.replaceChildren(
        ...txs.map((x) => {
          const vsize = Math.ceil((x.weight || 0) / 4),
            cb = x.vin && x.vin[0] && x.vin[0].is_coinbase,
            out = (x.vout || []).reduce((a, o) => a + (o.value || 0), 0);
          return el(
            'tr',
            null,
            el(
              'td',
              { class: 'mono' },
              el('a', { href: '#/tx/' + x.txid }, x.txid.slice(0, 8) + '…' + x.txid.slice(-6))
            ),
            el('td', { class: 'num' }, !cb && vsize ? L.fmtFee(x.fee / vsize) + ' sat/vB' : '–'),
            el('td', { class: 'num' }, L.fmtBtc(out) + ' BTC')
          );
        })
      );
      range.textContent = t('blkTxRange', {
        a: L.fmtNum(start + 1),
        b: L.fmtNum(Math.min(start + PAGE, total)),
        n: L.fmtNum(total),
      });
      prev.disabled = start === 0;
      next.disabled = start + PAGE >= total;
    } catch {
      if (tok === blockToken) range.textContent = t('notFound');
      prev.disabled = start === 0;
    }
  };
  prev.onclick = () => {
    start = Math.max(0, start - PAGE);
    show();
  };
  next.onclick = () => {
    start += PAGE;
    show();
  };
  show();
  return el(
    'section',
    { class: 'panel', id: 'blk-txs' },
    el('h2', { class: 'sec' }, t('txs')),
    range,
    el('table', { class: 'addrtxs' }, tbody),
    el('p', { class: 'row' }, prev, next)
  );
}
export let txToken = 0;
export function viewTx(id) {
  const root = el('div'),
    tok = ++txToken;
  root.append(
    el('a', { class: 'back', href: '#/' }, '← ' + t('dash')),
    el('h1', null, t('txTitle')),
    el('p', { class: 'dim mono txid' }, id)
  );
  const body = el('div', { class: 'panel' }, t('loading'));
  root.append(body);
  (async () => {
    try {
      // the fee estimate too, for a waiting transaction opened from a link before the app has fetched it,
      // and the chain tip, for the confirmation count of a link opened before the app has fetched it
      const [raw, fees, tip] = await Promise.all([
        api.tx(id),
        st.fees || api.fees().catch(() => null),
        Number.isFinite(st.tip) ? st.tip : api.tip().then(Number, () => NaN),
      ]);
      const x = L.parseTx(raw, Number.isFinite(st.tip) ? st.tip : tip);
      if (tok !== txToken) return;
      const p = price(),
        fiat = (sats) => (Number.isFinite(p) ? ` (${L.fmtNum((sats / 1e8) * p, 2)} ${S.cur})` : '');
      const rows = [[t('status'), x.confirmed ? t('confirmed') : t('waiting')]];
      if (x.confirmed)
        rows.push(
          [t('confs'), L.fmtNum(x.confs)],
          [t('blockL'), el('a', { href: '#/block/' + x.height }, '#' + L.fmtNum(x.height))],
          [t('time'), fmtD(x.time * 1000)]
        );
      else if (st.proj && st.proj.length) {
        const q = L.txQueuePos(x.feeRate, st.proj);
        rows.push([t('eta'), q === 0 ? t('etaNext') : q > 0 ? t('etaN', { n: q + 1, m: (q + 1) * 10 }) : t('etaLow')]);
      }
      if (x.coinbase) rows.push([t('fee'), t('coinbase')]);
      else
        rows.push([t('fee'), L.fmtNum(x.fee) + ' sats' + fiat(x.fee)], [t('feeRate'), L.fmtFee(x.feeRate) + ' sat/vB']);
      rows.push(
        [t('size'), L.fmtNum(x.vsize) + ' vB'],
        [t('insOuts'), `${x.ins} / ${x.outs}`],
        [t('totalOut'), L.satsToBtc(x.valueOut) + ' BTC' + fiat(x.valueOut)]
      );
      body.replaceChildren(
        ...[
          kv(rows),
          x.confirmed
            ? null
            : el('p', null, el('a', { href: '#/mining?tx=' + id, class: 'watchlink' }, t('watchTx') + ' →')),
          x.confirmed ? null : txAlertRow(id),
          x.confirmed || x.coinbase ? null : stuckBox(x, fees),
          flowBox(raw),
          x.coinbase ? null : privacyBox(raw),
          shareRow('/tx/' + id, 'BLOCKHORIZON · ' + t('txTitle')),
        ].filter(Boolean)
      );
    } catch {
      if (tok === txToken) body.textContent = t('notFound');
    }
  })();
  return root;
}
// Where the coins came from and where they went: each input (an output of an earlier transaction, linked) and each
// output, with its address (linked to the address page) and amount. Long lists show the first FLOW_MAX of each.
const FLOW_MAX = 50;
const shortAddr = (a) => (a.length > 20 ? a.slice(0, 10) + '…' + a.slice(-6) : a);
export function flowBox(raw) {
  const f = L.txFlow(raw),
    btc = (v) => (Number.isFinite(v) ? L.fmtBtc(v) + ' BTC' : '–');
  const who = (o) =>
    o.addr
      ? el('a', { href: '#/address/' + o.addr, class: 'mono', title: o.addr }, shortAddr(o.addr))
      : el('span', { class: 'dim' }, o.type === 'op_return' ? t('txData') : t('txNoAddr', { t: o.type || '?' }));
  const list = (items, row, id) =>
    el(
      'table',
      { class: 'addrtxs flow', id },
      el(
        'tbody',
        null,
        items.slice(0, FLOW_MAX).map(row),
        items.length > FLOW_MAX
          ? el(
              'tr',
              null,
              el('td', { class: 'dim', colspan: '2' }, t('txMore', { n: L.fmtNum(items.length - FLOW_MAX) }))
            )
          : null
      )
    );
  const inRow = (i) =>
    i.coinbase
      ? el('tr', null, el('td', { class: 'dim' }, t('txNewCoins')), el('td', { class: 'num' }, ''))
      : el(
          'tr',
          null,
          el(
            'td',
            null,
            i.addr ? who(i) : el('span', { class: 'dim' }, t('txNoAddr', { t: i.type || '?' })),
            ' ',
            el('a', { href: '#/tx/' + i.txid, class: 'dim prev', title: i.txid + ':' + i.vout }, '↩')
          ),
          el('td', { class: 'num' }, btc(i.value))
        );
  const outRow = (o) => el('tr', null, el('td', null, who(o)), el('td', { class: 'num' }, btc(o.value)));
  return el(
    'section',
    { class: 'txflow' },
    el('h2', { class: 'sec' }, t('txIns', { n: L.fmtNum(f.ins.length) })),
    list(f.ins, inRow, 'tx-ins'),
    el('h2', { class: 'sec' }, t('txOuts', { n: L.fmtNum(f.outs.length) })),
    list(f.outs, outRow, 'tx-outs')
  );
}
// What anyone looking at this transaction can tell about who sent it, worked out on this device (nothing is sent).
export function privacyBox(raw) {
  const hints = L.txPrivacy(raw),
    from = new Set(
      L.txFlow(raw)
        .ins.map((i) => i.addr)
        .filter(Boolean)
    ).size;
  const text = {
    reuse: t('privReuse'),
    merge: t('privMerge', { n: L.fmtNum(from) }),
    round: t('privRound'),
    types: t('privTypes'),
  };
  return el(
    'section',
    { class: 'txpriv', id: 'tx-privacy' },
    el('h2', { class: 'sec' }, t('privTitle')),
    el('p', { class: 'dim' }, t('privIntro')),
    hints.length
      ? el(
          'ul',
          null,
          hints.map((h) => el('li', { 'data-hint': h }, text[h]))
        )
      : el('p', null, t('privNone'))
  );
}
// "Tell me when it is confirmed": a sound and a message when it is in a block (and, on a node with phone
// notifications on, a message on the phone too). Toggles; the Alarm page lists them.
function txAlertRow(id) {
  const on = () => txAlerts().some((a) => a.txid === id),
    msg = el('span', { class: 'dim', role: 'status' });
  const btn = el('button', {
    id: 'tx-alert',
    'aria-pressed': String(on()),
    onclick: () => {
      const list = txAlerts().filter((a) => a.txid !== id);
      if (!on()) {
        list.push({ txid: id, sound: S.asound });
        askNotify();
      }
      store('txAlerts', list);
      paint();
      msg.textContent = on() ? t(pushOn() ? 'txAlertSetPhone' : 'txAlertSet') : '';
    },
  });
  const paint = () => {
    btn.textContent = on() ? '🔔 ' + t('txAlertOff') : '🔔 ' + t('txAlertOn');
    btn.setAttribute('aria-pressed', String(on()));
  };
  paint();
  return el('p', { class: 'row' }, btn, msg);
}
// An address: its balance and recent transactions, from the data server. The page says where it was looked up.
export let addrToken = 0;
// A QR code of the address (as a bitcoin: link, which wallets read), drawn on this device: dark on white in both
// themes, with a quiet zone, as scanners expect.
function addrQr(a) {
  const q = L.qrEncode('bitcoin:' + a);
  if (!q) return null;
  const n = q.size + 8;
  let d = '';
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.get(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('class', 'qr');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('addrQrAria', { a }));
  svg.setAttribute('shape-rendering', 'crispEdges');
  // a whole number of pixels per module (about 240 px in all), so every square comes out the same size
  svg.setAttribute('width', String(n * Math.max(2, Math.floor(240 / n))));
  svg.innerHTML = `<rect width="${n}" height="${n}" fill="#fff"/><path fill="#000" d="${d}"/>`;
  return el(
    'section',
    { class: 'panel', id: 'addr-qr' },
    el('h2', { class: 'sec' }, t('addrQr')),
    svg,
    el('p', { class: 'dim note' }, t('addrQrNote'))
  );
}
export function viewAddress(a) {
  const root = el('div'),
    tok = ++addrToken;
  root.append(
    el('a', { class: 'back', href: '#/' }, '← ' + t('dash')),
    el('h1', null, t('addrPage')),
    el('p', { class: 'dim mono txid' }, a)
  );
  const body = el('div', { class: 'panel' }, t('loading'));
  root.append(body, el('p', { class: 'dim', id: 'addr-where' }, t('addrLookedUp', { s: lookupHost() })), addrQr(a));
  (async () => {
    try {
      const [info, txs] = await Promise.all([api.address(a), api.addrTxs(a).catch(() => [])]);
      if (tok !== addrToken) return;
      const x = L.parseAddress(info),
        p = price(),
        btc = (sats) =>
          L.fmtBtc(sats) + ' BTC' + (Number.isFinite(p) ? ` (${L.fmtNum((sats / 1e8) * p, 2)} ${S.cur})` : '');
      const rows = [[t('addrBalance'), btc(x.balance)]];
      if (x.pending) rows.push([t('addrPending'), (x.pending > 0 ? '+' : '−') + btc(Math.abs(x.pending))]);
      rows.push([t('addrReceivedAll'), btc(x.received)], [t('addrTxCount'), L.fmtNum(x.txs)]);
      const list = (Array.isArray(txs) ? txs : []).slice(0, 25).map((tx) => {
        const n = L.addrReceived(tx, a),
          s = tx.status || {};
        return el(
          'tr',
          null,
          el(
            'td',
            { class: 'mono' },
            el('a', { href: '#/tx/' + tx.txid }, tx.txid.slice(0, 8) + '…' + tx.txid.slice(-6))
          ),
          el('td', null, s.confirmed ? fmtD(s.block_time * 1000) : t('waiting')),
          el('td', { class: 'num ' + (n >= 0 ? 'up' : 'down') }, (n >= 0 ? '+' : '−') + L.fmtBtc(Math.abs(n)) + ' BTC')
        );
      });
      body.replaceChildren(
        kv(rows),
        el('h3', { class: 'sec' }, t('addrRecent')),
        list.length
          ? el('table', { id: 'addr-txs', class: 'addrtxs' }, el('tbody', null, list))
          : el('p', { class: 'dim' }, t('addrNoTx')),
        shareRow('/address/' + a, 'BLOCKHORIZON · ' + t('addrPage'))
      );
    } catch {
      if (tok === addrToken) body.textContent = t('notFound');
    }
  })();
  return root;
}
// A waiting transaction whose fee is below what the next block needs: what can be done, in plain words, with what each
// way would cost now (from the fee estimate for the next block). Only a link to mempool.space's Accelerator: nothing
// is sent anywhere unless it is followed.
function stuckBox(x, fees) {
  const rate = fees && fees.fastestFee,
    s = L.speedUp(x, rate);
  if (!s || !s.stuck) return null;
  const sats = (n) => L.fmtNum(n);
  return el(
    'section',
    { class: 'stuck', id: 'tx-stuck' },
    el('h2', null, t('stuckTitle')),
    el('p', { class: 'dim' }, t('stuckIntro')),
    el('p', null, t('stuckNow', { r: L.fmtFee(rate), f: sats(s.rbf), p: sats(x.fee) })),
    el(
      'ul',
      null,
      el('li', null, t('stuckRbf', { f: sats(s.rbf) })),
      el('li', null, t('stuckCpfp', { f: sats(s.cpfp) })),
      el(
        'li',
        null,
        t('stuckAcc') + ' ',
        el(
          'a',
          { href: 'https://mempool.space/tx/' + x.id, target: '_blank', rel: 'noopener noreferrer' },
          t('stuckAccLink') + ' ↗'
        )
      ),
      el('li', null, t('stuckWait'))
    )
  );
}
