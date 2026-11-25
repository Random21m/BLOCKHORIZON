// The embeddable widget (embed.html): one live value with a link back to the app. No settings, no storage of its own:
// everything comes from the URL. Polls every 30 seconds while visible (no websocket, to stay light on other people's pages).
import * as L from './lib.js';
import { api } from './api.js';
import { t, setLang, detectLang, LANGS } from './i18n.js';
import { CURRENCIES } from './price.js';

const q = new URLSearchParams(location.search), $ = (id) => document.getElementById(id);
const show = ['height', 'halving', 'price'].includes(q.get('show')) ? q.get('show') : 'height';
const cur = CURRENCIES.includes(q.get('cur')) ? q.get('cur') : 'USD';
const lang = LANGS[q.get('lang')] ? q.get('lang') : detectLang();
const theme = q.get('theme') === 'light' || q.get('theme') === 'dark' ? q.get('theme') : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
document.documentElement.dataset.theme = theme; document.documentElement.lang = lang; setLang(lang);
$('w').href = new URL('./', location.href).href + (show === 'halving' ? '#/events' : show === 'price' ? '#/charts' : '#/');

let tip = NaN, lastTs = NaN;
function paint() {
  const set = (id, s) => { if ($(id).textContent !== s) $(id).textContent = s; };
  if (show === 'height') {
    set('lab', t('height')); set('num', L.fmtNum(tip));
    set('sub', Number.isFinite(lastTs) ? t('since') + ': ' + L.fmtDuration(Date.now() / 1000 - lastTs) : '');
  } else if (show === 'halving') {
    const hv = Number.isFinite(tip) ? L.halvingInfo(tip) : null;
    set('lab', t('halving')); set('num', hv ? L.fmtNum(hv.blocksToGo) : '–');
    set('sub', hv ? t('blocksToGo') + ' · ' + t('est', { d: new Date(hv.estMs).toLocaleDateString(lang, { year: 'numeric', month: 'short' }) }) : '');
  }
  $('w').setAttribute('aria-label', [$('lab').textContent, $('num').textContent, $('sub').textContent, 'BLOCKHORIZON'].filter(Boolean).join(', '));
}
async function refresh() {
  if (document.hidden) return;
  try {
    if (show === 'price') {
      const p = await api.prices(), v = p && p[cur];
      if (Number.isFinite(v)) { $('lab').textContent = t('price'); $('num').textContent = L.fmtNum(v, v < 100 ? 2 : 0) + ' ' + cur; $('sub').textContent = L.fmtNum(L.satsPerUnit(v)) + ' sats · ' + t('perCur', { c: cur }); }
      $('w').setAttribute('aria-label', [$('lab').textContent, $('num').textContent, $('sub').textContent, 'BLOCKHORIZON'].join(', '));
      return;
    }
    const [h, b] = await Promise.all([api.tip(), show === 'height' ? api.blocks() : Promise.resolve(null)]);
    const n = L.parseTipHeight(h); if (Number.isFinite(n)) tip = n;
    if (Array.isArray(b) && b[0]) lastTs = b[0].timestamp;
  } catch { /* keep the last value */ }
  paint();
}
refresh(); setInterval(refresh, 30000); document.addEventListener('visibilitychange', refresh);
if (show === 'height') setInterval(paint, 1000); // the "since last block" clock
