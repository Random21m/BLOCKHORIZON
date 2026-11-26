export const G = [
  [
    'Timechain',
    'A Bitcoin-blokkok sorba rendezett lánca. Minden blokk az előzőre mutat, így az események sorrendjét nem lehet csendben átírni.',
  ],
  ['Blokk', 'Tranzakciók csomagja, amelyben a bányászok megegyeznek, és nagyjából tízpercenként hozzáfűzik a lánchoz.'],
  [
    'Blokkmagasság',
    'Hány blokk van ez előtt. Az első blokk (genezis) magassága 0, így a magasság olyan óra, amely csak előre számol.',
  ],
  ['Korszak', '210 000 blokkos szakasz (kb. négy év), amelyen belül a blokkjutalom nem változik.'],
  ['Halving', 'Felezés: a korszak végén az új coinokból álló blokkonkénti jutalom a felére csökken.'],
  ['Támogatás', 'Az újonnan létrehozott bitcoin, amelyet a bányász minden blokkban felvehet, a díjakon felül.'],
  ['Kínálat', 'Az eddig létrehozott összes bitcoin. Soha nem lépheti át a 21 milliót.'],
  [
    'Nehézség',
    'Milyen nehéz a feladvány, amelyet a bányászok megoldanak. 2016 blokkonként újraállítják, hogy a blokkok kb. tízpercenként jöjjenek.',
  ],
  [
    'Nehézségállítás',
    'Maga az újraállítás: ha az utolsó 2016 blokk tíz percnél gyorsabban jött, a nehézség nő; ha lassabban, csökken.',
  ],
  [
    'Hashrate',
    'Hány próbálkozást tesznek a bányászok együtt másodpercenként. Magasabb hashrate több energiát jelent a lánc védelmében.',
  ],
  ['Proof of work', 'Bizonyíték arra, hogy valódi számítási munka ment egy blokk létrehozására, ami drágává teszi a csalást.'],
  ['Mempool', 'Az érvényes tranzakciók váróterme, amelyek még nem kerültek blokkba.'],
  ['Mempool-mélység', 'Durva becslés arra, hány teli blokk kellene a várakozó tranzakciók elviteléhez.'],
  ['Díjszint', 'Amennyit egy tranzakció méretegységenként fizet (sat/vB). A bányászok általában a legmagasabbakat veszik fel először.'],
  [
    'vByte (vB)',
    'A tranzakcióméret egysége, amely figyelembe veszi a SegWit-kedvezményt. Egy blokkba kb. egymillió vB fér.',
  ],
  ['Sat', 'A bitcoin százmilliomod része, a legkisebb egység.'],
  ['Moszkvai idő', 'Játékos óraállás: hány satot ér egy pénznem egysége, időként kiírva.'],
  ['Node', 'Számítógép, amely maga ellenőriz minden szabályt, és továbbítja a blokkokat és a tranzakciókat.'],
  ['Lightning-hálózat', 'A Bitcoinra épülő réteg gyors, kis fizetésekhez, a láncon feltöltött csatornákon keresztül.'],
  ['Coinbase', 'A blokk első tranzakciója, amellyel a bányász felveszi a támogatást és a díjakat.'],
];
export const A = [
  'Kibányászták a genezisblokkot',
  'Az első Bitcoin-tranzakció (170. blokk)',
  'Bitcoin Pizza Day: az első ismert vásárlás bitcoinnal',
  'Megjelent a whitepaper',
  'Az első halving (210 000. blokk)',
  'A második halving (420 000. blokk)',
  'A harmadik halving (630 000. blokk)',
  'A negyedik halving (840 000. blokk)',
];
