export const G = [
  [
    'Timechain',
    'Bitcoin-lohkojen järjestetty ketju. Jokainen lohko viittaa edelliseen, joten tapahtumien järjestystä ei voi huomaamatta kirjoittaa uudelleen.',
  ],
  ['Lohko', 'Joukko siirtoja, joista louhijat sopivat ja jotka lisätään ketjuun, noin kymmenen minuutin välein.'],
  [
    'Lohkokorkeus',
    'Kuinka monta lohkoa on ennen tätä. Ensimmäisen lohkon (genesis) korkeus on 0, joten korkeus toimii kellona, joka laskee vain ylöspäin.',
  ],
  ['Jakso', '210 000 lohkon jakso (noin neljä vuotta), jonka aikana lohkopalkkio pysyy samana.'],
  ['Halving', 'Jakson lopussa tapahtuva puoliintuminen, jossa uusien kolikoiden palkkio lohkoa kohden puolittuu.'],
  ['Lohkotuki', 'Uudet bitcoinit, jotka louhija saa ottaa jokaisesta lohkosta, maksuja lukuun ottamatta.'],
  ['Tarjonta', 'Kaikki tähän mennessä luodut bitcoinit. Määrä ei voi koskaan ylittää 21 miljoonaa.'],
  [
    'Vaikeus',
    'Kuinka vaikea on louhijoiden ratkaisema arvoitus. Se säädetään 2 016 lohkon välein, jotta lohkoja syntyy noin kymmenen minuutin välein.',
  ],
  [
    'Vaikeuden säätö',
    'Itse säätö: jos viimeiset 2 016 lohkoa syntyivät nopeammin kuin kymmenen minuutin välein, vaikeus nousee; jos hitaammin, se laskee.',
  ],
  [
    'Laskentateho',
    'Kuinka monta arvausta sekunnissa louhijat tekevät yhteensä. Suurempi laskentateho tarkoittaa, että ketjua suojaa enemmän energiaa.',
  ],
  [
    'Proof of work',
    'Todiste siitä, että lohkon luomiseen on käytetty todellista laskentatyötä, mikä tekee huijaamisesta kallista.',
  ],
  ['Mempool', 'Kelvollisten siirtojen odotushuone: siirrot, joita ei ole vielä lisätty lohkoon.'],
  [
    'Mempoolin syvyys',
    'Karkea arvio siitä, montako täyttä lohkoa tarvittaisiin kaikkien odottavien siirtojen käsittelyyn.',
  ],
  ['Maksutaso', 'Mitä siirto maksaa kokoyksikköä kohden (sat/vB). Louhijat valitsevat yleensä korkeimmat tasot ensin.'],
  ['vByte (vB)', 'Siirron koon yksikkö, joka ottaa SegWit-alennuksen huomioon. Lohkoon mahtuu noin miljoona vB.'],
  ['Sat', 'Sadasmiljoonasosa bitcoinista, pienin yksikkö.'],
  [
    'Moskovan aika',
    'Leikkisä kellolukema: kuinka monta satsia yhdellä valuuttayksiköllä saa, esitettynä kellonaikana.',
  ],
  ['Solmu', 'Tietokone, joka tarkistaa itse jokaisen säännön ja välittää lohkoja ja siirtoja eteenpäin.'],
  [
    'Lightning-verkko',
    'Bitcoinin päällä toimiva kerros nopeille pienmaksuille kanavien kautta, jotka rahoitetaan ketjussa.',
  ],
  ['Coinbase', 'Lohkon ensimmäinen siirto, jossa louhija kerää lohkotuen ja maksut.'],
];
export const A = [
  'Genesis-lohko louhittiin',
  'Ensimmäinen Bitcoin-siirto (lohko 170)',
  'Bitcoin Pizza Day: ensimmäinen tunnettu ostos bitcoinilla',
  'Whitepaper julkaistiin',
  'Ensimmäinen halving (lohko 210 000)',
  'Toinen halving (lohko 420 000)',
  'Kolmas halving (lohko 630 000)',
  'Neljäs halving (lohko 840 000)',
];
