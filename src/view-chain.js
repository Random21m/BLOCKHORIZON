// Block and transaction pages.
import * as L from './lib.js';
import { api, store } from './api.js';
import { t } from './i18n.js';
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
    } catch {
      if (tok === blockToken) body.textContent = t('notFound');
    }
  })();
  return root;
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
      const x = L.parseTx(await api.tx(id), st.tip);
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
          shareRow('/tx/' + id, 'BLOCKHORIZON · ' + t('txTitle')),
        ].filter(Boolean)
      );
    } catch {
      if (tok === txToken) body.textContent = t('notFound');
    }
  })();
  return root;
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
