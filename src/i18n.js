// Interface texts. Each language is its own file in src/lang/, and only the chosen one is downloaded: English is always
// loaded (it is the fallback for any missing key), any other language is fetched by loadLang() before it is used.
import EN from './lang/en.js';
import { setUnits } from './lib.js';
export const LANGS = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  tr: 'Türkçe',
  ja: '日本語',
};
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
export function t(k, v) {
  const s = T[cur][k] || T.en[k] || k;
  return v ? s.replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? String(v[x]) : m)) : s;
}
export const getLang = () => cur;
export function detectLang() {
  const n = ((typeof navigator !== 'undefined' && navigator.language) || 'en').slice(0, 2);
  return LANGS[n] ? n : 'en';
}
