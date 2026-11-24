// Our own wording. Short explanations of the terms used on the dashboard.
export const GLOSSARY = [
  ['Timechain', 'The ordered chain of Bitcoin blocks. Each block points to the one before it, so the order of events cannot be quietly rewritten.'],
  ['Block', 'A batch of transactions that miners agree on and add to the chain, about once every ten minutes.'],
  ['Block height', 'How many blocks sit before this one. The first block (genesis) has height 0, so height works as a clock that only counts up.'],
  ['Epoch', 'A stretch of 210,000 blocks (about four years) during which the block reward stays the same.'],
  ['Halving', 'The event at the end of an epoch where the new-coin reward per block is cut in half.'],
  ['Subsidy', 'The newly created bitcoin a miner may claim in each block, not counting fees.'],
  ['Supply', 'All bitcoin created so far. It can never pass 21 million.'],
  ['Difficulty', 'How hard the puzzle is that miners solve. It is retargeted every 2,016 blocks to keep blocks near ten minutes.'],
  ['Difficulty adjustment', 'The retarget itself: if the last 2,016 blocks came faster than ten minutes each, difficulty rises; if slower, it falls.'],
  ['Hashrate', 'How many guesses per second miners make together. A higher hashrate means more energy is protecting the chain.'],
  ['Proof of work', 'Evidence that real computing effort was spent to create a block, which makes cheating expensive.'],
  ['Mempool', 'The waiting room of valid transactions that have not been put in a block yet.'],
  ['Mempool depth', 'A rough count of how many full blocks it would take to clear the waiting transactions.'],
  ['Fee rate', 'What a transaction pays per unit of size (sat/vB). Miners tend to pick the highest rates first.'],
  ['vByte (vB)', 'A unit of transaction size that accounts for the SegWit discount. A block holds about one million vB.'],
  ['Sat', 'One hundred-millionth of a bitcoin, the smallest unit.'],
  ['Moscow time', 'A playful clock reading: how many sats one unit of a currency buys, shown like a time.'],
  ['Node', 'A computer that checks every rule itself and relays blocks and transactions.'],
  ['Lightning network', 'A layer on top of Bitcoin for fast, small payments through channels funded on-chain.'],
  ['Coinbase', 'The first transaction in a block, where the miner collects the subsidy and fees.'],
];
// Historic dates (m = month, d = day, y = year).
export const ANNIVERSARIES = [
  { m: 1, d: 3, y: 2009, text: 'Genesis block mined' },
  { m: 1, d: 12, y: 2009, text: 'First Bitcoin transaction (block 170)' },
  { m: 5, d: 22, y: 2010, text: 'Bitcoin Pizza Day: first known purchase with bitcoin' },
  { m: 10, d: 31, y: 2008, text: 'Whitepaper published' },
  { m: 11, d: 28, y: 2012, text: 'First halving (block 210,000)' },
  { m: 7, d: 9, y: 2016, text: 'Second halving (block 420,000)' },
  { m: 5, d: 11, y: 2020, text: 'Third halving (block 630,000)' },
  { m: 4, d: 20, y: 2024, text: 'Fourth halving (block 840,000)' },
];

// Bitcoin YouTube channels for the Watch page, A to Z by handle (case ignored).
export const CHANNELS = [
  '88_sats',
  'BTCSessions',
  'CanadianBitcoiners',
  'carlabotcoin',
  'MapleBitcoin',
  'PlebUnderground',
  'SovereignSessions',
  'theguyswann',
  'thejackmallersshow',
  'TheLotRadio',
  'WalkerAmerica',
  'WhatBitcoinDidPod',
];

// Websites listed under the channels on the Watch page, A to Z by name (case ignored).
export const SITES = [
  { name: 'The Lot Radio', url: 'https://www.thelotradio.com/' },
];
