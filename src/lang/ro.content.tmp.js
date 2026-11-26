export const G = [
  [
    'Timechain',
    'Lanțul ordonat de blocuri Bitcoin. Fiecare bloc trimite la cel dinaintea lui, așa că ordinea evenimentelor nu poate fi rescrisă pe ascuns.',
  ],
  ['Bloc', 'Un pachet de tranzacții asupra căruia minerii cad de acord și care se adaugă la lanț, cam o dată la zece minute.'],
  [
    'Înălțimea blocului',
    'Câte blocuri se află înaintea acestuia. Primul bloc (geneza) are înălțimea 0, așa că înălțimea funcționează ca un ceas care doar crește.',
  ],
  ['Epocă', 'O perioadă de 210.000 de blocuri (aproximativ patru ani) în care recompensa pe bloc rămâne aceeași.'],
  ['Halving', 'Momentul de la sfârșitul unei epoci când recompensa în monede noi pe bloc se înjumătățește.'],
  ['Subvenție', 'Bitcoinii nou creați pe care un miner îi poate lua în fiecare bloc, fără a pune la socoteală comisioanele.'],
  ['Ofertă', 'Toți bitcoinii creați până acum. Oferta nu poate depăși niciodată 21 de milioane.'],
  [
    'Dificultate',
    'Cât de greu este puzzle-ul pe care îl rezolvă minerii. Se reajustează la fiecare 2.016 blocuri, ca blocurile să rămână în jur de zece minute.',
  ],
  [
    'Ajustarea dificultății',
    'Reajustarea propriu-zisă: dacă ultimele 2.016 blocuri au venit mai repede de zece minute fiecare, dificultatea crește; dacă mai încet, scade.',
  ],
  [
    'Hashrate',
    'Câte încercări pe secundă fac minerii împreună. Un hashrate mai mare înseamnă mai multă energie care protejează lanțul.',
  ],
  ['Proof of work', 'Dovada că s-a depus efort real de calcul pentru a crea un bloc, ceea ce face frauda scumpă.'],
  ['Mempool', 'Sala de așteptare a tranzacțiilor valide care nu au fost încă puse într-un bloc.'],
  ['Adâncimea mempoolului', 'O estimare aproximativă a câte blocuri pline ar fi necesare pentru a goli tranzacțiile în așteptare.'],
  [
    'Rata comisionului',
    'Cât plătește o tranzacție pe unitatea de dimensiune (sat/vB). Minerii tind să aleagă mai întâi ratele cele mai mari.',
  ],
  [
    'vByte (vB)',
    'O unitate de dimensiune a tranzacției care ține cont de reducerea SegWit. Un bloc încape aproximativ un milion de vB.',
  ],
  ['Sat', 'O sută milioana parte dintr-un bitcoin, cea mai mică unitate.'],
  ['Ora Moscovei', 'O citire jucăușă de ceas: câți sats cumpără o unitate dintr-o monedă, afișat ca o oră.'],
  ['Nod', 'Un calculator care verifică singur fiecare regulă și transmite mai departe blocuri și tranzacții.'],
  ['Rețeaua Lightning', 'Un strat peste Bitcoin pentru plăți rapide și mici, prin canale finanțate on-chain.'],
  ['Coinbase', 'Prima tranzacție dintr-un bloc, în care minerul încasează subvenția și comisioanele.'],
];
export const A = [
  'Blocul geneză este minat',
  'Prima tranzacție Bitcoin (blocul 170)',
  'Bitcoin Pizza Day: prima cumpărătură cunoscută plătită cu bitcoin',
  'Whitepaperul este publicat',
  'Primul halving (blocul 210.000)',
  'Al doilea halving (blocul 420.000)',
  'Al treilea halving (blocul 630.000)',
  'Al patrulea halving (blocul 840.000)',
];
