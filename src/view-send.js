// Send a signed transaction: paste its raw hex, see what it does (read on this device: its ID, size, inputs, outputs,
// fee and privacy hints, with the coins it spends looked up on the data server), then send it to the data server.
import * as L from './lib.js';
import { api, broadcast, lookupHost } from './api.js';
import { t } from './i18n.js';
import { st, el, toast } from './state.js';
import { kv } from './ui.js';
import { flowBox, privacyBox } from './view-chain.js';

let draft = ''; // the pasted hex: kept while the app is open (the Search box can hand one over), never stored
export const setDraft = (hex) => {
  draft = hex;
};
let checkToken = 0;
const PREV_MAX = 25; // inputs whose coins are looked up (a fee needs them all; very large transactions show no fee)

export function viewSend() {
  const box = el('textarea', {
      id: 'snd-hex',
      class: 'mono',
      dir: 'ltr', // hex reads left to right in every language
      rows: 6,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-describedby': 'snd-intro',
    }),
    out = el('div', { id: 'snd-out', 'aria-live': 'polite' });
  box.value = draft;
  box.addEventListener('input', () => {
    draft = box.value;
    checkToken++; // an edit makes the last check stale
    out.replaceChildren();
  });
  const form = el(
    'form',
    {
      class: 'panel sendform',
      onsubmit: (e) => {
        e.preventDefault();
        check(box.value, out);
      },
    },
    el('label', { for: 'snd-hex' }, t('sendPaste')),
    box,
    el('div', { class: 'row' }, el('button', { class: 'btn-go', type: 'submit' }, t('sendCheck')))
  );
  if (draft) queueMicrotask(() => check(draft, out));
  return el(
    'div',
    { class: 'sendview' },
    el('a', { class: 'back', href: '#/' }, '← ' + t('dash')),
    el('h1', null, t('sendTitle').toLocaleUpperCase(document.documentElement.lang)),
    el('p', { class: 'dim', id: 'snd-intro' }, t('sendIntro')),
    form,
    out
  );
}

async function check(hex, out) {
  const tok = ++checkToken,
    tx = L.parseRawTx(hex);
  if (tx.error) {
    out.replaceChildren(el('p', { class: 'panel err' }, t(tx.error === 'hex' ? 'sendBadHex' : 'sendBadTx')));
    return;
  }
  const feeCell = el('span', null, '…'),
    status = el('div', { class: 'sendstatus' }, el('p', { class: 'dim' }, t('loading'))),
    lists = el('div', null, flowBox(L.asServerTx(tx)));
  out.replaceChildren(
    el(
      'section',
      { class: 'panel' },
      el('h2', null, t('sendWhat')),
      kv([
        [t('mineTrackPh'), el('code', { class: 'mono txid', id: 'snd-txid', dir: 'ltr' }, tx.txid)],
        [t('size'), t('sendSize', { v: L.fmtNum(tx.vsize), w: L.fmtNum(tx.weight) })],
        [t('fee'), feeCell],
      ]),
      el('p', { class: 'dim note' }, t(tx.rbf ? 'sendRbf' : 'sendFinal')),
      lists,
      status
    )
  );
  // already on the network? and the coins it spends (for the fee and the inputs' addresses)
  const ids = [...new Set(tx.vin.map((i) => i.txid))];
  const [known, prevs] = await Promise.all([
    api.tx(tx.txid).catch(() => null),
    ids.length <= PREV_MAX
      ? Promise.all(
          ids.map((id) =>
            Promise.all([api.tx(id), api.outspends(id).catch(() => null)]).then(
              ([x, sp]) => [id, Object.assign({}, x, { spends: sp })],
              () => [id, null]
            )
          )
        )
      : Promise.resolve([]),
  ]);
  if (tok !== checkToken) return;
  const prevTx = new Map(prevs.filter(([, x]) => x));
  const prevVal = new Map();
  for (const i of tx.vin) {
    const o = prevTx.get(i.txid)?.vout?.[i.vout];
    if (o) prevVal.set(i.txid + ':' + i.vout, o.value);
  }
  const server = L.asServerTx(tx, prevTx);
  lists.replaceChildren(flowBox(server), privacyBox(server));
  const fee = L.txFee(tx, prevVal),
    rate = fee / tx.vsize,
    f = st.fees || {};
  feeCell.textContent = Number.isFinite(fee)
    ? t('sendFeeVal', { s: L.fmtNum(fee), r: L.fmtFee(rate) })
    : ids.length > PREV_MAX
      ? '–'
      : t('sendFeeUnknown');
  const notes = [];
  if (!known && ids.length <= PREV_MAX && prevVal.size < tx.vin.length) notes.push(['warn', t('sendMissing')]);
  // coins another transaction has spent already: in a block, it would be refused; while that one waits, this one only
  // goes through if it replaces it (a higher fee)
  const spentBy = tx.vin
    .map((i) => prevTx.get(i.txid)?.spends?.[i.vout])
    .filter((x) => x && x.spent && x.txid !== tx.txid);
  if (!known && spentBy.some((x) => x.status && x.status.confirmed)) notes.push(['warn', t('sendSpent')]);
  else if (!known && spentBy.length) notes.push(['warn', t('sendReplaces')]);
  if (Number.isFinite(fee) && fee < 0) notes.push(['warn', t('sendNegative')]);
  else if (Number.isFinite(rate)) {
    if (f.fastestFee > 0 && rate > Math.max(5 * f.fastestFee, 200))
      notes.push(['warn', t('sendHigh', { r: L.fmtFee(f.fastestFee) })]);
    else if (f.minimumFee > 0 && rate < f.minimumFee) notes.push(['warn', t('sendLow', { m: L.fmtFee(f.minimumFee) })]);
    else if (f.hourFee > 0 && rate < f.hourFee) notes.push(['dim', t('sendSlow', { r: L.fmtFee(f.hourFee) })]);
  }
  const noteEls = notes.map(([c, m]) => el('p', { class: c === 'warn' ? 'warnline' : 'dim' }, m));
  if (known) {
    status.replaceChildren(
      el('p', null, t('sendKnown'), ' ', el('a', { href: '#/tx/' + tx.txid, id: 'snd-open' }, t('sendOpen')))
    );
    return;
  }
  const host = lookupHost(),
    btn = el('button', { class: 'btn-go', type: 'button', id: 'snd-go' }, t('sendTo', { h: host })),
    result = el('p', { id: 'snd-result', role: 'status' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    result.className = 'dim';
    result.textContent = t('sending');
    try {
      const id = await broadcast(L.toHex(L.fromHex(hex.replace(/\s+/g, '').toLowerCase())));
      if (tok !== checkToken) return;
      draft = '';
      result.className = '';
      result.replaceChildren(t('sendDone'), ' ', el('a', { href: '#/tx/' + (id || tx.txid) }, t('sendOpen')));
      btn.remove();
      toast(t('sendDone'));
    } catch (e) {
      if (tok !== checkToken) return;
      btn.disabled = false;
      result.className = 'warnline';
      result.textContent = t('sendFail', { m: e && e.message ? e.message : '?' });
    }
  });
  status.replaceChildren(...noteEls, el('p', { class: 'dim note' }, t('sendNote', { h: host })), btn, result);
}
