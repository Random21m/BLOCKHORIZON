// The embeddable widget (embed.html): one live value with a link back to the app. No settings, no storage of its own:
// everything comes from the URL. Polls every 30 seconds while visible (no websocket, to stay light on other people's pages).
// show=mining draws a small picture of the block being mined: its fee mix from the projected block (no per-transaction feed).
import * as L from './lib.js';
import { api } from './api.js';
import { t, setLang, detectLang, LANGS } from './i18n.js';
import { CURRENCIES } from './price.js';

const q = new URLSearchParams(location.search), $ = (id) => document.getElementById(id);
const show = ['height', 'halving', 'price', 'mining'].includes(q.get('show')) ? q.get('show') : 'height';
const cur = CURRENCIES.includes(q.get('cur')) ? q.get('cur') : 'USD';
const lang = LANGS[q.get('lang')] ? q.get('lang') : detectLang();
const theme = q.get('theme') === 'light' || q.get('theme') === 'dark' ? q.get('theme') : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
document.documentElement.dataset.theme = theme; document.documentElement.lang = lang; setLang(lang);
$('w').href = new URL('./', location.href).href + (show === 'halving' ? '#/events' : show === 'price' ? '#/charts' : show === 'mining' ? '#/mining' : '#/');
let cv = null, pb = null, drawn = '';
if (show === 'mining') { // picture on the left, the words beside it
  const w = $('w'), txt = document.createElement('span'); txt.className = 'txt'; txt.append(...w.childNodes);
  cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); w.classList.add('mining'); w.append(cv, txt);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { drawn = ''; draw(); }).observe(cv);
}
function draw() {
  if (!cv || !pb) return; const dpr = Math.min(2, devicePixelRatio || 1), px = Math.round(cv.clientWidth * dpr), key = `${tip}:${pb.nTx}:${px}`;
  if (!px || key === drawn) return; drawn = key; cv.width = cv.height = px;
  const list = L.approxBlock(pb, (tip || 1) * 7919), g = Math.min(110, Math.max(50, Math.ceil(Math.sqrt(list.length * 1.6) / 5) * 5)), lay = L.packBlock(list, g), c = px / g, gap = c >= 3 ? 0.5 : 0, x = cv.getContext('2d');
  x.clearRect(0, 0, px, px); for (const p of lay) { x.fillStyle = L.feeColor(p.rate); x.fillRect(p.x * c + gap, (g - p.y - p.s) * c + gap, p.s * c - 2 * gap, p.s * c - 2 * gap); }
}

let tip = NaN, lastTs = NaN;
function paint() {
  const set = (id, s) => { if ($(id).textContent !== s) $(id).textContent = s; };
  if (show === 'height') {
    set('lab', t('height')); set('num', L.fmtNum(tip));
    set('sub', Number.isFinite(lastTs) ? t('since') + ': ' + L.fmtDuration(Date.now() / 1000 - lastTs) : '');
  } else if (show === 'mining') {
    set('lab', t('mineEyebrow')); set('num', Number.isFinite(tip) ? '#' + L.fmtNum(tip + 1) : '–');
    set('sub', [Number.isFinite(lastTs) ? L.fmtDuration(Date.now() / 1000 - lastTs) : '', pb ? L.fmtNum(pb.nTx) + ' tx' : ''].filter(Boolean).join(' · ')); draw();
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
    const [h, b, pr] = await Promise.all([api.tip(), show === 'height' || show === 'mining' ? api.blocks() : Promise.resolve(null), show === 'mining' ? api.projected() : Promise.resolve(null)]);
    const n = L.parseTipHeight(h); if (Number.isFinite(n)) tip = n; if (Array.isArray(pr) && pr[0]) pb = pr[0];
    if (Array.isArray(b) && b[0]) lastTs = b[0].timestamp;
  } catch { /* keep the last value */ }
  paint();
}
refresh(); setInterval(refresh, 30000); document.addEventListener('visibilitychange', refresh);
if (show === 'height' || show === 'mining') setInterval(paint, 1000); // the "since last block" clock
