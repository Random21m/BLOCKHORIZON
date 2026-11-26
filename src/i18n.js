// Interface texts. Each language is its own file in src/lang/, and only the chosen one is downloaded: English is always
// loaded (it is the fallback for any missing key), any other language is fetched by loadLang() before it is used.
import EN from './lang/en.js';
import { setUnits } from './lib.js';
export const LANGS = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pt: 'Português (Portugal)',
  'pt-BR': 'Português (Brasil)',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  cs: 'Čeština',
  sv: 'Svenska',
  tr: 'Türkçe',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  ru: 'Русский',
  uk: 'Українська',
  hi: 'हिन्दी',
  ja: '日本語',
  ko: '한국어',
  zh: '简体中文',
  ar: 'العربية',
  fa: 'فارسی',
  he: 'עברית',
};
// Languages written right to left: the page is mirrored for them (charts, block strips and numbers keep left to right).
export const isRtl = (l) => l === 'ar' || l === 'fa' || l === 'he';
const T = { en: EN }; // the languages loaded so far
const loading = {};
// Fetch a language's texts (once). Resolves when they are ready; if they cannot be fetched (offline and never saved)
// the app stays in English and tries again on the next call.
export function loadLang(l) {
  if (!LANGS[l] || T[l]) return Promise.resolve();
  return (
    loading[l] ||
    (loading[l] = import(`./lang/${l}.js`)
      .then(
        (m) => {
          T[l] = m.default;
        },
        () => {}
      )
      .finally(() => {
        delete loading[l];
      }))
  );
}
export const isLoaded = (l) => !!T[l];
let cur = 'en';
// Switch to a loaded language (one not loaded yet shows English until loadLang() has fetched it).
export function setLang(l) {
  cur = T[l] ? l : 'en';
  const [y, d, h, m, s] = (T[cur].units || T.en.units).split(' ');
  setUnits({ y, d, h, m, s });
}
// t('key') or t('key', { n: 5 }): {name} placeholders are filled from the second argument.
// In a right-to-left language a translated text starts with a right-to-left mark (RLM), so it reads right to left even
// when its first word is Latin ("Bitcoin ..."); bare numbers and units on the page keep left to right (see style.css).
export const rtlText = (s) => (isRtl(cur) ? '\u200f' + s : s);
// In a right-to-left language each filled-in value is also wrapped in Unicode isolate marks (FSI ... PDI), so a date,
// amount or unit inside a sentence keeps its own reading order ("متوقع 11/27/2026 1:10 AM").
export function t(k, v) {
  const s = T[cur][k] || T.en[k] || k,
    [a, b] = isRtl(cur) ? ['\u2068', '\u2069'] : ['', ''];
  return rtlText(v ? s.replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? a + String(v[x]) + b : m)) : s);
}
export const getLang = () => cur;
// The browser's language: an exact match first (pt-BR), then the language alone (de-AT -> de, zh-TW -> zh, pt-PT -> pt).
export function detectLang(tag = (typeof navigator !== 'undefined' && navigator.language) || 'en') {
  const [l, r] = String(tag).split(/[-_]/),
    full = l.toLowerCase() + (r ? '-' + r.toUpperCase() : '');
  if (LANGS[full]) return full;
  return LANGS[l.toLowerCase()] ? l.toLowerCase() : 'en';
}
