export const G = [
  [
    'Timechain',
    'Den ordnede kæde af Bitcoin-blokke. Hver blok peger på den forrige, så rækkefølgen ikke kan skrives om i det stille.',
  ],
  ['Blok', 'En samling transaktioner, som minerne bliver enige om og føjer til kæden, cirka hvert tiende minut.'],
  [
    'Blokhøjde',
    'Hvor mange blokke der ligger før denne. Den første blok (genesis) har højde 0, så højden fungerer som et ur, der kun tæller op.',
  ],
  ['Epoke', 'En periode på 210.000 blokke (cirka fire år), hvor blokbelønningen er den samme.'],
  ['Halvering', 'Begivenheden ved slutningen af en epoke, hvor belønningen i nye mønter pr. blok halveres.'],
  ['Subsidie', 'De nyskabte bitcoin, en miner må tage i hver blok, gebyrer ikke medregnet.'],
  ['Udbud', 'Alle bitcoin, der er skabt indtil nu. Det kan aldrig komme over 21 millioner.'],
  [
    'Sværhedsgrad',
    'Hvor svær den gåde er, som minerne løser. Den justeres hver 2.016. blok, så blokkene holder sig omkring ti minutter.',
  ],
  [
    'Sværhedsjustering',
    'Selve justeringen: kom de sidste 2.016 blokke hurtigere end ti minutter hver, stiger sværhedsgraden; kom de langsommere, falder den.',
  ],
  [
    'Hashrate',
    'Hvor mange gæt i sekundet minerne laver tilsammen. En højere hashrate betyder, at mere energi beskytter kæden.',
  ],
  ['Proof of work', 'Bevis for, at der er brugt ægte regnekraft på at skabe en blok, hvilket gør snyd dyrt.'],
  ['Mempool', 'Venteværelset for gyldige transaktioner, der endnu ikke er kommet i en blok.'],
  ['Mempool-dybde', 'Et groft tal for, hvor mange fulde blokke der skal til for at rydde de ventende transaktioner.'],
  [
    'Gebyrsats',
    'Hvad en transaktion betaler pr. størrelsesenhed (sat/vB). Minerne vælger som regel de højeste satser først.',
  ],
  [
    'vByte (vB)',
    'En enhed for transaktionsstørrelse, der tager højde for SegWit-rabatten. En blok rummer cirka en million vB.',
  ],
  ['Sat', 'En hundrede milliontedel af en bitcoin, den mindste enhed.'],
  ['Moskva-tid', 'En legende urvisning: hvor mange sats én enhed af en valuta køber, vist som et klokkeslæt.'],
  ['Node', 'En computer, der selv tjekker alle regler og sender blokke og transaktioner videre.'],
  [
    'Lightning-netværket',
    'Et lag oven på Bitcoin til hurtige, små betalinger gennem kanaler, der er finansieret on-chain.',
  ],
  ['Coinbase', 'Den første transaktion i en blok, hvor mineren indkasserer subsidien og gebyrerne.'],
];
export const A = [
  'Genesis-blokken udvundet',
  'Første Bitcoin-transaktion (blok 170)',
  'Bitcoin Pizza Day: første kendte køb med bitcoin',
  'Whitepaper udgivet',
  'Første halvering (blok 210.000)',
  'Anden halvering (blok 420.000)',
  'Tredje halvering (blok 630.000)',
  'Fjerde halvering (blok 840.000)',
];
