// Halving replay, chain calendar, glossary, watch list, about.
import * as L from './lib.js';
import { t, getLang, rtlText } from './i18n.js';
import { GLOSSARY, ANNIVERSARIES, CHANNELS, SITES } from './content.js';
import { GLOSSARY_TR, ANNIV_TR } from './content-i18n.js';
import { VERSION, TIP_ADDR, S, st, fmtD, el, toast } from './state.js';
import { kv, bar } from './ui.js';

export function viewReplay() {
  const root = el('div');
  root.append(
    el('h1', null, t('replay').toLocaleUpperCase(document.documentElement.lang)),
    el('p', { class: 'dim' }, t('replayIntro'))
  );
  const last = Math.floor((Number.isFinite(st.tip) ? st.tip : 0) / L.EPOCH);
  const rows = Array.from({ length: Math.max(last, 0) + 2 }, (_, e) => ({
    e,
    h: e * L.EPOCH,
    reward: L.subsidy(e * L.EPOCH),
    supply: e ? L.supplyAt(e * L.EPOCH - 1) : 0,
    date: L.HALVINGS[e],
  }));
  const out = el('div', { class: 'panel' }),
    slider = el('input', {
      type: 'range',
      min: 0,
      max: rows.length - 1,
      value: 0,
      id: 'rp',
      'aria-label': t('halvingStep'),
      style: 'width:100%',
    });
  const show = (i) => {
    const r = rows[i];
    out.replaceChildren(
      el('h2', null, i === 0 ? t('genesisEpoch') : t('halvingN', { n: i })),
      el('div', { class: 'big' }, t('perBlock', { r: L.satsToBtc(r.reward, 4) })),
      kv([
        [t('startsAt'), L.fmtNum(r.h)],
        [
          t('dateL'),
          r.date
            ? fmtD(r.date, { dateOnly: true })
            : r.h <= st.tip
              ? '–'
              : t('aboutD', { d: fmtD(L.futureEstimate(r.h, st.tip).ms, { dateOnly: true }) }),
        ],
        [t('supplyBefore'), L.satsToBtc(r.supply, 2) + ' BTC'],
        [t('share21'), ((r.supply / L.MAX_SATS) * 100).toFixed(2) + '%'],
      ]),
      bar(r.supply / L.MAX_SATS)
    );
  };
  slider.addEventListener('input', () => show(+slider.value));
  let timer;
  const playBtn = el(
    'button',
    {
      class: 'btn-go',
      onclick: () => {
        clearInterval(timer);
        slider.value = 0;
        show(0);
        timer = setInterval(
          () => {
            if (+slider.value >= rows.length - 1) return clearInterval(timer);
            slider.value = +slider.value + 1;
            show(+slider.value);
          },
          S.reduced ? 400 : 1100
        );
      },
    },
    '▶ ' + t('play')
  );
  addEventListener('hashchange', () => clearInterval(timer), { once: true });
  root.append(el('div', { class: 'row' }, playBtn, slider), out);
  show(0);
  return root;
}
export function viewEvents() {
  const root = el('div');
  root.append(el('h1', null, t('calTitle')));
  const upcoming = [];
  const now = Date.now();
  if (Number.isFinite(st.tip)) {
    const hv = L.halvingInfo(st.tip, now);
    upcoming.push([hv.estMs, t('evHalving', { h: L.fmtNum(hv.nextHeight), r: L.satsToBtc(hv.nextSubsidy, 5) })]);
    if (st.diff)
      upcoming.push([
        st.diff.estimatedRetargetDate,
        t('evDiff', {
          h: L.fmtNum(st.diff.nextRetargetHeight),
          c: (st.diff.difficultyChange >= 0 ? '+' : '') + st.diff.difficultyChange.toFixed(2),
        }),
      ]);
    for (const m of [1000000, 1050000, 1100000])
      if (m > st.tip && m !== hv.nextHeight)
        upcoming.push([L.futureEstimate(m, st.tip, now).ms, t('evBlock', { n: L.fmtNum(m) })]);
  }
  upcoming.sort((a, b) => a[0] - b[0]);
  root.append(
    el(
      'div',
      { class: 'panel' },
      el('h2', null, t('comingUp')),
      el(
        'table',
        null,
        el(
          'tbody',
          null,
          upcoming.map(([ms, tx]) => el('tr', null, el('td', null, fmtD(ms, { dateOnly: true })), el('td', null, tx)))
        )
      )
    )
  );
  const d = new Date(now),
    key = (d.getMonth() + 1) * 100 + d.getDate();
  const tr = ANNIV_TR[getLang()],
    ann = ANNIVERSARIES.map((a, i) => Object.assign({}, a, { text: rtlText((tr && tr[i]) || a.text) })).sort(
      (a, b) => ((a.m * 100 + a.d - key + 1300) % 1300) - ((b.m * 100 + b.d - key + 1300) % 1300)
    );
  root.append(
    el(
      'div',
      { class: 'panel', style: 'margin-top:12px' },
      el('h2', null, t('anniversaries')),
      el(
        'table',
        null,
        el(
          'tbody',
          null,
          ann.map((a) =>
            el(
              'tr',
              null,
              el('td', { class: 'nowrap' }, monthDay(a.m, a.d)),
              el('td', null, a.text),
              el('td', { class: 'num dim' }, String(a.y))
            )
          )
        )
      )
    )
  );
  return root;
}
export function viewGlossary() {
  const root = el('div');
  root.append(el('h1', null, t('glossary').toLocaleUpperCase(document.documentElement.lang)));
  root.append(
    el(
      'dl',
      { class: 'glossary panel' },
      (GLOSSARY_TR[getLang()] || GLOSSARY).map(([k, v]) =>
        el('div', null, el('dt', null, rtlText(k)), el('dd', null, rtlText(v)))
      )
    )
  );
  return root;
}
export function viewWatch() {
  const list = [...CHANNELS].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }));
  const sites = [...SITES].sort((x, y) => x.name.localeCompare(y.name, 'en', { sensitivity: 'base' }));
  return el(
    'div',
    null,
    el('h1', null, t('watch').toLocaleUpperCase(document.documentElement.lang)),
    el(
      'div',
      { class: 'panel' },
      el('p', { class: 'dim' }, t('watchIntro')),
      el(
        'ul',
        { class: 'channels' },
        list.map((h) =>
          el(
            'li',
            null,
            el(
              'a',
              { href: 'https://www.youtube.com/@' + h, target: '_blank', rel: 'noopener noreferrer' },
              '@' + h + ' ↗'
            )
          )
        )
      ),
      el('h2', { class: 'sites-h' }, t('sites')),
      el(
        'ul',
        { class: 'channels sites' },
        sites.map((x) =>
          el('li', null, el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.name + ' ↗'))
        )
      )
    )
  );
}
export function viewAbout() {
  const root = el('div');
  root.append(
    el('h1', null, t('about').toLocaleUpperCase(document.documentElement.lang)),
    el(
      'div',
      { class: 'panel' },
      el('p', null, t('about1')),
      el('p', null, t('about2')),
      el('p', { class: 'dim' }, t('version', { v: VERSION })),
      el(
        'p',
        null,
        el('a', { href: 'https://github.com/Random21m/blockhorizon' }, t('source')),
        ' · ',
        el('a', { href: 'privacy.html' }, t('privacy'))
      )
    )
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TIP_ADDR);
      toast(t('copied'));
    } catch {
      const r = document.createRange();
      r.selectNodeContents(addr);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      toast(t('selectCopy'));
    }
  };
  const addr = el('code', { id: 'tip-addr', class: 'tip-addr' }, TIP_ADDR);
  root.append(
    el(
      'div',
      { class: 'panel support', id: 'support' },
      el('h2', null, t('support')),
      el('p', null, t('tipIntro')),
      el('img', { class: 'tip-qr', src: 'docs/support-qr.svg', alt: t('qrAlt'), width: 220, height: 220 }),
      addr,
      el(
        'p',
        { class: 'row' },
        el('button', { id: 'tip-copy', onclick: copy }, t('copyAddr')),
        el('a', { href: 'lightning:' + TIP_ADDR }, t('openWallet'))
      ),
      el('p', { class: 'dim' }, t('tipNote'))
    ),
    embedPanel()
  );
  return root;
}
// "Embed on your site": pick what to show, see it live, copy one line of HTML. The snippet points at this site's own address.
function embedPanel() {
  const site = location.href
    .split('#')[0]
    .split('?')[0]
    .replace(/[^/]*$/, '');
  const opt = (id, label, pairs) =>
    el(
      'select',
      { id, 'aria-label': label },
      pairs.map(([v, l]) => el('option', { value: v }, l))
    );
  const what = opt('emb-what', t('embedWhat'), [
    ['height', t('height')],
    ['halving', t('halving')],
    ['price', t('price')],
    ['mining', t('mining')],
  ]);
  const theme = opt('emb-theme', t('theme'), [
    ['auto', t('auto')],
    ['dark', t('dark')],
    ['light', t('light')],
  ]);
  const code = el('textarea', {
    id: 'emb-code',
    readonly: true,
    rows: 4,
    spellcheck: 'false',
    'aria-label': t('embedCode'),
  });
  const frame = el('iframe', { id: 'emb-prev', class: 'emb-prev', title: t('embedPreview'), width: 320, height: 120 });
  const upd = () => {
    const qs =
      `show=${what.value}&theme=${theme.value}&lang=${S.lang}` + (what.value === 'price' ? `&cur=${S.cur}` : '');
    const label = what.options[what.selectedIndex].textContent;
    const hgt = what.value === 'mining' ? 150 : 120; // the mining picture needs a little more height
    code.value = `<iframe src="${site}embed.html?${qs}" width="320" height="${hgt}" style="border:0" title="BLOCKHORIZON: ${label}" loading="lazy"></iframe>`;
    frame.src = 'embed.html?' + qs;
    frame.height = hgt;
  };
  what.addEventListener('change', upd);
  theme.addEventListener('change', upd);
  upd();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.value);
      toast(t('codeCopied'));
    } catch {
      code.select();
      toast(t('selectCopy'));
    }
  };
  return el(
    'div',
    { class: 'panel', id: 'embed' },
    el('h2', null, t('embedTitle')),
    el('p', null, t('embedIntro')),
    el(
      'div',
      { class: 'row' },
      el('label', { for: 'emb-what' }, t('embedWhat')),
      what,
      el('label', { for: 'emb-theme' }, t('theme')),
      theme
    ),
    el('p', { class: 'dim' }, t('embedPreview')),
    frame,
    el('label', { for: 'emb-code', class: 'dim' }, t('embedCode')),
    code,
    el('p', { class: 'row' }, el('button', { id: 'emb-copy', onclick: copy }, t('copyCode')))
  );
}
// "Nov 28" in the reader's language (anniversaries have no year of their own).
function monthDay(m, d) {
  try {
    return new Date(2000, m - 1, d).toLocaleDateString(getLang(), { month: 'short', day: 'numeric' });
  } catch {
    return `${m}-${d}`;
  }
}
