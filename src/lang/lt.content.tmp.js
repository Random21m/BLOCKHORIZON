export const G = [
  [
    'Timechain',
    'Sutvarkyta Bitcoin blokų grandinė. Kiekvienas blokas nurodo į ankstesnį, todėl įvykių tvarkos negalima tyliai perrašyti.',
  ],
  [
    'Blokas',
    'Transakcijų rinkinys, dėl kurio susitaria kasėjai ir kuris pridedamas prie grandinės maždaug kas dešimt minučių.',
  ],
  [
    'Bloko aukštis',
    'Kiek blokų yra prieš šį. Pirmojo bloko (genezės) aukštis yra 0, todėl aukštis veikia kaip laikrodis, kuris skaičiuoja tik į priekį.',
  ],
  ['Epocha', '210 000 blokų laikotarpis (maždaug ketveri metai), per kurį bloko atlygis nesikeičia.'],
  ['Halvingas', 'Įvykis epochos pabaigoje, kai atlygis naujomis monetomis už bloką sumažinamas perpus.'],
  ['Subsidija', 'Naujai sukurti bitcoin, kuriuos kasėjas gali pasiimti už kiekvieną bloką, neskaičiuojant mokesčių.'],
  ['Pasiūla', 'Visi iki šiol sukurti bitcoin. Jų niekada nebus daugiau nei 21 milijonas.'],
  [
    'Sudėtingumas',
    'Kokį sunkų galvosūkį sprendžia kasėjai. Jis perskaičiuojamas kas 2016 blokų, kad blokai būtų randami maždaug kas dešimt minučių.',
  ],
  [
    'Sudėtingumo korekcija',
    'Pats perskaičiavimas: jei paskutiniai 2016 blokų buvo rasti greičiau nei kas dešimt minučių, sudėtingumas didėja; jei lėčiau – mažėja.',
  ],
  [
    'Maišos galia (hashrate)',
    'Kiek spėjimų per sekundę kartu atlieka visi kasėjai. Didesnė maišos galia reiškia, kad grandinę saugo daugiau energijos.',
  ],
  [
    'Darbo įrodymas (proof of work)',
    'Įrodymas, kad bloko sukūrimui sunaudota tikrų skaičiavimo pastangų, todėl sukčiauti brangu.',
  ],
  ['Mempool', 'Galiojančių transakcijų laukiamasis, kurios dar nepateko į jokį bloką.'],
  ['Mempool gylis', 'Apytikslis skaičius, kiek pilnų blokų prireiktų visoms laukiančioms transakcijoms sutalpinti.'],
  [
    'Mokesčio norma',
    'Kiek transakcija moka už dydžio vienetą (sat/vB). Kasėjai paprastai pirmiausia renkasi didžiausias normas.',
  ],
  ['vBaitas (vB)', 'Transakcijos dydžio vienetas, įvertinantis SegWit nuolaidą. Į bloką telpa maždaug milijonas vB.'],
  ['Sat', 'Šimtamilijonoji bitcoin dalis, mažiausias vienetas.'],
  [
    'Maskvos laikas',
    'Žaismingas laikrodžio rodmuo: kiek sats galima nusipirkti už vieną valiutos vienetą, parodyta kaip laikas.',
  ],
  ['Mazgas', 'Kompiuteris, kuris pats tikrina visas taisykles ir perduoda blokus bei transakcijas toliau.'],
  ['Lightning tinklas', 'Sluoksnis virš Bitcoin greitiems, smulkiems mokėjimams per kanalus, finansuotus grandinėje.'],
  ['Coinbase', 'Pirmoji bloko transakcija, kurioje kasėjas pasiima subsidiją ir mokesčius.'],
];
export const A = [
  'Iškastas genezės blokas',
  'Pirmoji Bitcoin transakcija (blokas 170)',
  'Bitcoin Pizza Day: pirmasis žinomas pirkinys už bitcoin',
  'Paskelbta baltoji knyga (whitepaper)',
  'Pirmasis halvingas (blokas 210 000)',
  'Antrasis halvingas (blokas 420 000)',
  'Trečiasis halvingas (blokas 630 000)',
  'Ketvirtasis halvingas (blokas 840 000)',
];
