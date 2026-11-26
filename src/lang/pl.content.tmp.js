export const G = [
  [
    'Timechain',
    'Uporządkowany łańcuch bloków Bitcoina. Każdy blok wskazuje na poprzedni, więc kolejności zdarzeń nie da się po cichu zmienić.',
  ],
  ['Blok', 'Paczka transakcji, na którą zgadzają się górnicy i dodają ją do łańcucha, mniej więcej co dziesięć minut.'],
  [
    'Wysokość bloku',
    'Ile bloków jest przed tym blokiem. Pierwszy blok (genesis) ma wysokość 0, więc wysokość działa jak zegar, który liczy tylko w górę.',
  ],
  ['Epoka', 'Odcinek 210 000 bloków (około czterech lat), w którym nagroda za blok pozostaje taka sama.'],
  ['Halving', 'Zdarzenie na końcu epoki, w którym nagroda w nowych monetach za blok spada o połowę.'],
  ['Subsydium', 'Nowo utworzone bitcoiny, które górnik może zabrać w każdym bloku, nie licząc opłat.'],
  ['Podaż', 'Wszystkie bitcoiny utworzone do tej pory. Nigdy nie przekroczy 21 milionów.'],
  [
    'Trudność',
    'Jak trudna jest zagadka, którą rozwiązują górnicy. Jest korygowana co 2016 bloków, aby bloki pojawiały się mniej więcej co dziesięć minut.',
  ],
  [
    'Zmiana trudności',
    'Sama korekta: jeśli ostatnie 2016 bloków pojawiało się szybciej niż co dziesięć minut, trudność rośnie; jeśli wolniej, spada.',
  ],
  [
    'Hashrate',
    'Ile prób na sekundę wykonują łącznie wszyscy górnicy. Wyższy hashrate oznacza więcej energii chroniącej łańcuch.',
  ],
  [
    'Proof of work',
    'Dowód, że na utworzenie bloku zużyto prawdziwą pracę obliczeniową, przez co oszustwo jest drogie.',
  ],
  ['Mempool', 'Poczekalnia ważnych transakcji, które jeszcze nie trafiły do bloku.'],
  [
    'Głębokość mempoolu',
    'Przybliżona liczba pełnych bloków potrzebnych, aby zmieściły się wszystkie czekające transakcje.',
  ],
  [
    'Stawka opłaty',
    'Ile transakcja płaci za jednostkę rozmiaru (sat/vB). Górnicy zwykle wybierają najpierw najwyższe stawki.',
  ],
  ['vByte (vB)', 'Jednostka rozmiaru transakcji uwzględniająca zniżkę SegWit. Blok mieści około miliona vB.'],
  ['Sat', 'Jedna stumilionowa bitcoina, najmniejsza jednostka.'],
  [
    'Czas moskiewski',
    'Zabawny odczyt w formie zegara: ile satsów można kupić za jedną jednostkę waluty, pokazane jak godzina.',
  ],
  ['Węzeł', 'Komputer, który sam sprawdza każdą regułę i przekazuje dalej bloki i transakcje.'],
  ['Sieć Lightning', 'Warstwa nad Bitcoinem do szybkich, drobnych płatności przez kanały zasilone w łańcuchu.'],
  ['Coinbase', 'Pierwsza transakcja w bloku, w której górnik odbiera subsydium i opłaty.'],
];
export const A = [
  'Wykopano blok genesis',
  'Pierwsza transakcja bitcoinowa (blok 170)',
  'Bitcoin Pizza Day: pierwszy znany zakup za bitcoiny',
  'Publikacja whitepaper',
  'Pierwszy halving (blok 210 000)',
  'Drugi halving (blok 420 000)',
  'Trzeci halving (blok 630 000)',
  'Czwarty halving (blok 840 000)',
];
