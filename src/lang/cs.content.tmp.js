export const G = [
  [
    'Timechain',
    'Uspořádaný řetězec bitcoinových bloků. Každý blok odkazuje na ten předchozí, takže pořadí událostí nejde potichu přepsat.',
  ],
  ['Blok', 'Dávka transakcí, na které se těžaři shodnou a přidají ji do řetězce, zhruba jednou za deset minut.'],
  [
    'Výška bloku',
    'Kolik bloků je před tímto blokem. První blok (genesis) má výšku 0, takže výška funguje jako hodiny, které jen přičítají.',
  ],
  ['Epocha', 'Úsek 210 000 bloků (zhruba čtyři roky), během kterého zůstává odměna za blok stejná.'],
  ['Halving', 'Událost na konci epochy, kdy se odměna v nových mincích za blok sníží na polovinu.'],
  ['Odměna za blok', 'Nově vytvořené bitcoiny, které si těžař smí v každém bloku vzít, bez započtení poplatků.'],
  ['Nabídka', 'Všechny dosud vytvořené (vytěžené) bitcoiny. Nikdy nepřekročí 21 milionů.'],
  [
    'Obtížnost',
    'Jak těžká je hádanka, kterou těžaři řeší. Upravuje se každých 2 016 bloků, aby bloky přicházely zhruba po deseti minutách.',
  ],
  [
    'Změna obtížnosti',
    'Samotná úprava: když posledních 2 016 bloků přišlo rychleji než po deseti minutách, obtížnost roste; když pomaleji, klesá.',
  ],
  [
    'Hashrate',
    'Kolik pokusů za sekundu těžaři dohromady udělají. Vyšší hashrate znamená, že řetězec chrání víc energie.',
  ],
  [
    'Proof of work',
    'Důkaz, že na vytvoření bloku byla vynaložena skutečná výpočetní práce, díky čemuž je podvádění drahé.',
  ],
  ['Mempool', 'Čekárna platných transakcí, které ještě nebyly zařazeny do bloku.'],
  ['Hloubka mempoolu', 'Hrubý odhad, kolik plných bloků by bylo potřeba, aby se čekající transakce vyčistily.'],
  [
    'Výše poplatku',
    'Kolik transakce platí za jednotku velikosti (sat/vB). Těžaři obvykle berou nejvyšší sazby jako první.',
  ],
  ['vByte (vB)', 'Jednotka velikosti transakce, která zohledňuje slevu SegWit. Do bloku se vejde zhruba milion vB.'],
  ['Sat', 'Jedna stomiliontina bitcoinu, nejmenší jednotka.'],
  ['Moskevský čas', 'Hravé zobrazení jako na hodinách: kolik satů koupíte za jednu jednotku měny.'],
  ['Uzel', 'Počítač, který sám kontroluje všechna pravidla a předává dál bloky a transakce.'],
  ['Síť Lightning', 'Vrstva nad Bitcoinem pro rychlé drobné platby přes kanály financované na řetězci.'],
  ['Coinbase', 'První transakce v bloku, ve které si těžař vybírá odměnu za blok a poplatky.'],
];
export const A = [
  'Vytěžen genesis blok',
  'První bitcoinová transakce (blok 170)',
  'Bitcoin Pizza Day: první známý nákup za bitcoin',
  'Zveřejněn whitepaper',
  'První halving (blok 210 000)',
  'Druhý halving (blok 420 000)',
  'Třetí halving (blok 630 000)',
  'Čtvrtý halving (blok 840 000)',
];
