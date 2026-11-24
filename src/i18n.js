// Small string tables. English is the fallback for any missing key.
export const LANGS = { en: 'English', de: 'Deutsch', es: 'Español' };
const T = {
  en: { dash: 'Horizon', alarm: 'Alarm', calc: 'Calculator', replay: 'Halving replay', events: 'Calendar', glossary: 'Glossary', about: 'About', search: 'Search',
    height: 'Block height', since: 'Since last block', halving: 'Next halving', difficulty: 'Difficulty adjustment', hashrate: 'Hashrate', production: 'Block production',
    last: 'Last block', supply: 'Supply', fees: 'Fees (sat/vB)', mempool: 'Mempool', projected: 'Projected blocks', price: 'Price', lightning: 'Lightning network',
    recent: 'Recent blocks', settings: 'Settings', close: 'Close', go: 'Go', blocksToGo: 'blocks to go', priority: 'Priority', soon: 'Soon', anytime: 'Anytime', economy: 'Economy',
    byHeight: 'By block height', byDate: 'By date', notFound: 'Nothing found', offline: 'Offline: showing last saved values', theme: 'Colour mode', language: 'Language', currency: 'Currency' },
  de: { dash: 'Horizont', alarm: 'Alarm', calc: 'Rechner', replay: 'Halving-Replay', events: 'Kalender', glossary: 'Glossar', about: 'Info', search: 'Suche',
    height: 'Blockhöhe', since: 'Seit letztem Block', halving: 'Nächstes Halving', difficulty: 'Schwierigkeitsanpassung', hashrate: 'Hashrate', production: 'Blockproduktion',
    last: 'Letzter Block', supply: 'Angebot', fees: 'Gebühren (sat/vB)', mempool: 'Mempool', projected: 'Erwartete Blöcke', price: 'Preis', lightning: 'Lightning-Netzwerk',
    recent: 'Letzte Blöcke', settings: 'Einstellungen', close: 'Schließen', go: 'Los', blocksToGo: 'Blöcke übrig', priority: 'Priorität', soon: 'Bald', anytime: 'Jederzeit', economy: 'Spar',
    byHeight: 'Nach Blockhöhe', byDate: 'Nach Datum', notFound: 'Nichts gefunden', offline: 'Offline: zuletzt gespeicherte Werte', theme: 'Farbmodus', language: 'Sprache', currency: 'Währung' },
  es: { dash: 'Horizonte', alarm: 'Alarma', calc: 'Calculadora', replay: 'Repetición halving', events: 'Calendario', glossary: 'Glosario', about: 'Acerca de', search: 'Buscar',
    height: 'Altura de bloque', since: 'Desde el último bloque', halving: 'Próximo halving', difficulty: 'Ajuste de dificultad', hashrate: 'Hashrate', production: 'Producción de bloques',
    last: 'Último bloque', supply: 'Suministro', fees: 'Comisiones (sat/vB)', mempool: 'Mempool', projected: 'Bloques proyectados', price: 'Precio', lightning: 'Red Lightning',
    recent: 'Bloques recientes', settings: 'Ajustes', close: 'Cerrar', go: 'Ir', blocksToGo: 'bloques restantes', priority: 'Prioridad', soon: 'Pronto', anytime: 'Cuando sea', economy: 'Económica',
    byHeight: 'Por altura', byDate: 'Por fecha', notFound: 'Sin resultados', offline: 'Sin conexión: últimos valores guardados', theme: 'Modo de color', language: 'Idioma', currency: 'Moneda' },
};
let cur = 'en';
export function setLang(l) { cur = T[l] ? l : 'en'; }
export function t(k) { return (T[cur] && T[cur][k]) || T.en[k] || k; }
export function detectLang() { const n = (navigator.language || 'en').slice(0, 2); return T[n] ? n : 'en'; }
