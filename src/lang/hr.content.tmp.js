export const G = [
  [
    'Timechain',
    'Uređeni lanac Bitcoin blokova. Svaki blok upućuje na prethodni, pa se redoslijed događaja ne može potajno prepisati.',
  ],
  ['Blok', 'Skup transakcija oko kojih se rudari slože i dodaju ih u lanac, otprilike svakih deset minuta.'],
  [
    'Visina bloka',
    'Koliko blokova stoji prije ovoga. Prvi blok (genesis) ima visinu 0, pa visina radi kao sat koji broji samo prema gore.',
  ],
  ['Epoha', 'Razdoblje od 210.000 blokova (oko četiri godine) tijekom kojeg nagrada za blok ostaje ista.'],
  ['Halving', 'Prepolovljenje: događaj na kraju epohe kad se nagrada u novim novčićima po bloku smanji na pola.'],
  ['Subvencija', 'Novostvoreni bitcoini koje rudar smije uzeti u svakom bloku, ne računajući naknade.'],
  ['Ponuda', 'Svi dosad stvoreni bitcoini. Nikad ne može prijeći 21 milijun.'],
  [
    'Težina',
    'Koliko je težak zadatak koji rudari rješavaju. Prilagođava se svakih 2.016 blokova kako bi blokovi stizali oko svakih deset minuta.',
  ],
  [
    'Promjena težine',
    'Sama prilagodba: ako je zadnjih 2.016 blokova stizalo brže od deset minuta po bloku, težina raste; ako sporije, pada.',
  ],
  ['Hashrate', 'Koliko pokušaja u sekundi rudari zajedno naprave. Veći hashrate znači da lanac štiti više energije.'],
  ['Dokaz rada', 'Dokaz da je za stvaranje bloka utrošen stvarni računalni rad, zbog čega je varanje skupo.'],
  ['Mempool', 'Čekaonica valjanih transakcija koje još nisu stavljene u blok.'],
  ['Dubina mempoola', 'Gruba procjena koliko bi punih blokova trebalo da se isprazne transakcije koje čekaju.'],
  [
    'Stopa naknade',
    'Koliko transakcija plaća po jedinici veličine (sat/vB). Rudari obično najprije biraju najviše stope.',
  ],
  ['vByte (vB)', 'Jedinica veličine transakcije koja uračunava SegWit popust. Blok stane otprilike milijun vB.'],
  ['Sat', 'Stomilijunti dio bitcoina, najmanja jedinica.'],
  ['Moskovsko vrijeme', 'Zaigrani prikaz sata: koliko satsa kupuje jedna jedinica valute, prikazano kao vrijeme.'],
  ['Čvor', 'Računalo koje samo provjerava svako pravilo i prosljeđuje blokove i transakcije.'],
  ['Mreža Lightning', 'Sloj iznad Bitcoina za brza, mala plaćanja kroz kanale financirane na lancu.'],
  ['Coinbase', 'Prva transakcija u bloku, kojom rudar preuzima subvenciju i naknade.'],
];
export const A = [
  'Iskopan genesis blok',
  'Prva Bitcoin transakcija (blok 170)',
  'Bitcoin Pizza Day: prva poznata kupnja bitcoinom',
  'Objavljen whitepaper',
  'Prvi halving (blok 210.000)',
  'Drugi halving (blok 420.000)',
  'Treći halving (blok 630.000)',
  'Četvrti halving (blok 840.000)',
];
