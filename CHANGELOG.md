# Changelog

What changed in each version of BLOCKHORIZON, newest first. The version is shown at the bottom of the app.

## Unreleased

- **Send page privacy:** checking a transaction looked up the coins it spends on the backup server (blockstream.info)
  when the data server did not answer, even on your own node. It now asks only the data server the page names, a few
  at a time, and says "could not be checked" instead of "not found" when that server is busy.
- **Send page:** a version 3 transaction is shown as replaceable, and one that does not signal it no longer says it
  "cannot be replaced" (many nodes accept a replacement anyway). Screen readers hear one short summary of the check.
  Inputs not looked up say so instead of "no address". A transaction pasted into Search while on the Send page now
  replaces the one shown.
- **After switching data server,** the Mining and Charts pages show the new server's figures (or say it has none)
  instead of keeping the old server's pool ranking, adjustments and history.
- **Mining:** "Stop following" also empties the transaction box; a brief network hiccup no longer shows "Not
  available from this data server" for the pool ranking or the past adjustments.
- The fee tile's "later" fits in Finnish and Georgian; five unused texts were removed from every language.

## 0.22.0

- **A QR code on every address page,** to pay to it from a phone wallet. It is drawn on your device (as a `bitcoin:`
  link), black on white in both themes.
- **What miners earn per block, and how full blocks are.** Three more history charts on the Charts page, with the same
  1 month, 1 year and all time buttons: the fees per block (in BTC), the fees' share of what miners earn (block reward
  plus fees, in %) and the average block size (in MB).
- The Lightning tile showed mempool.space's figures as if they were current, but they can be months old: they stopped
  updating at the end of August 2026, and some answers even carry figures from 2024. Figures older than a week now show
  their date ("32,518 channels · Figures from 08/30/2026"; "As of 08/30/2026" on a phone).
- **Send a signed transaction.** Paste the raw hex your wallet exports (in Search, or on the new Send page linked from
  Search and the Calculator) and see what it does before anything leaves your device: its ID, size, fee and fee rate,
  every input and output with its address, and the privacy hints of the transaction page. It warns when the fee is
  unusually high or too low, when coins it spends are already spent or missing, and when the network already has it.
  Only when you press "Send to mempool.space" (or your own node) is it sent; never to the backup server.
- **Price and supply facts.** The "Long term" section of the Charts page opens with the all-time high (in your
  currency, with its date), how far below it the price is and for how many days, and the supply's yearly inflation now
  and after the next halving.
- **Block health.** A block's page shows how closely it matched the block mempool.space expected from its own
  mempool: the match in %, the fees it paid against the fees expected, how many expected transactions were left out,
  and how many it held that were not expected (and how many of those had been seen only moments before).
- On a phone, a block's transaction list could be wider than the screen when a row had a huge fee rate or amount
  (block 840,000 has both); those rows now wrap.

## 0.21.0

- **Three more long-term charts.** The **Puell Multiple** (the value of the bitcoins mined each day against its
  average over the past year), **hash ribbons** (the hashrate's 30- and 60-day averages, saying since when miners have
  been switching off or adding machines) and the **difficulty ribbon** (difficulty with its 9- to 200-day averages,
  and how far apart they are now). The two ribbons show the last two years. No new data: they use the price history
  and the hashrate and difficulty history the Charts page already loads.
- In right-to-left languages, the dates under the history charts ran from the right while the lines ran from the
  left; they now run from the left too.
- **Mining pools ranked, and every past difficulty adjustment.** Two new panels at the bottom of the Mining page.
  **Mining pools** ranks every pool that found a block over the last 24 hours, week, month or year: blocks, share
  and an estimate of its hashrate, with how few of the largest pools found more than half of the blocks. **Past
  difficulty adjustments** lists each adjustment, newest first: its date, its block (a link), the new difficulty and
  how much it changed, with a summary of the past year (how many went up and down, the largest rise and drop).
- **Is now a good time to send? The mempool over time, by fee rate.** A new chart on the Charts page shows how much
  was waiting to be mined over the last 24 hours, week, month, year or all time, stacked by the fee rate it pays in
  the same colours as the blocks, with a dashed line for one block. Above it: how much is waiting now, the fee rate
  where the next block would end, and how often the mempool was fuller than now in that range. The part paying under
  1 sat/vB (often most of it, and it may never be mined) is left out until you switch it on. The data comes from
  mempool.space or your own mempool server; the backup server does not have it, so the chart says so while it is in
  use.
- **What was in a past block.** A block's page now shows a picture of its transactions: each square is a slice of the
  block, coloured by fee rate, highest fees at the bottom, and tapping one opens its transaction. Below it, all its
  transactions 25 at a time, each with its fee rate and amount. The list also works from the backup server; the
  picture needs mempool.space and says so when it is not answering.
- **Where a transaction's coins came from and went.** A transaction's page lists every input and output, with its
  address (a link to the address page) and amount; each input links to the transaction that made it. Below, a
  **Privacy** box says in plain words what anyone looking at it can tell: an address used again, coins from several
  addresses spent together, a round amount or an address type that gives away which output is the change. It is
  worked out on your device; nothing is sent anywhere.
- A transaction link opened before the app had loaded counted its confirmations as 1; it now counts them right.
- **Five more languages: Bahasa Indonesia, Tiếng Việt, हिन्दी, Polski and Українська.** 18 languages in all,
  glossary and calendar included. A browser set to one of them gets its language on its own. These are machine
  translations for now; corrections from native speakers are welcome.
- **العربية (Arabic), the first language written right to left.** The whole page is mirrored for it: menus, tiles and
  texts read from the right, while numbers, amounts, charts and the block strips keep running left to right.
- **Five more languages: فارسی, עברית, ไทย, Čeština and Svenska.** Persian and Hebrew are right to left, like Arabic.
  24 languages in all, glossary and calendar included; machine translations for now, corrections welcome.
- **Eight more languages: Ελληνικά, Română, Magyar, Dansk, Norsk bokmål, Suomi, বাংলা and Bahasa Melayu.** 32
  languages in all, glossary and calendar included; machine translations for now, corrections welcome.
- **Six more languages: Hrvatski, नेपाली, ქართული, Lietuvių, Македонски and Slovenščina.** 38 languages in all,
  every language mempool.space offers and a few more.

## 0.20.0

- **Four long-term charts.** Below the history charts, a "Long term" section shows the price with its 200-week
  average, the Mayer Multiple (the price against its 200-day average), the halving cycles laid over each other (the
  price as a multiple of its value on each halving day) and the supply issued over time, all time, in your currency.
- **Look up an address.** Search now also takes a Bitcoin address and opens its page: balance, what is waiting to
  confirm, everything received, and the recent payments in and out. The search box and the page both say that the
  address is sent to the data server (mempool.space, unless you use your own node); it is never sent to the backup
  server.
- **Help when a payment is stuck.** On a waiting transaction whose fee is below what the next block needs, "Taking too
  long?" explains the ways out in plain words (replace it with a higher fee, a follow-up payment that pays for both,
  mempool.space's paid Accelerator, or wait), with what each would cost right now.

## 0.19.0

- **Four more languages: 简体中文, 한국어, Русский and Português (Brasil).** 13 languages in all, glossary and
  calendar included. Brazilian Portuguese is its own choice next to Portugal's; a browser set to Brazilian Portuguese
  gets it on its own, and one set to Chinese (any variant) gets Simplified Chinese.
- **The live price keeps going when Kraken is down.** If Kraken's price feed goes quiet for 15 seconds, the price in
  US dollars, euros and pounds streams from Coinbase's public feed instead, and switches back as soon as Kraken
  answers again. The label under the price says which one you are seeing. Other currencies update from mempool.space
  every minute meanwhile, as before.
- **Watch your own addresses, on your node.** On Umbrel, StartOS or the container, the Alarm page can watch up to 10
  Bitcoin addresses: a sound and a message when a payment to one of them is seen, and again once it is confirmed, and
  with "On your phone" on, your phone gets them too. Addresses are only ever looked up on your node; the public site
  does not offer this, because it would have to send them to mempool.space.

## 0.18.0

- **A block clock for a spare screen.** `#/clock?kiosk` turns Clock mode into a display for a screen that stays on (no
  close button or pointer, a note when data stops, a reload every 6 hours), and `#/clock?kiosk&eink` suits e-ink
  displays (black on white, changes only by the minute). The README has a Raspberry Pi guide.
- **Know when your payment confirms.** On a waiting transaction's page, "Tell me when it is confirmed" gives a sound and
  a message once it is in a block. On your own node with "On your phone" turned on, your phone gets it too, even
  with no browser open. The Alarm page lists the transactions you are waiting for.

## 0.17.0

- **Choose your dashboard.** A new Dashboard tab in Settings lets you hide the tiles you do not need and put the rest
  in your own order. The projected and recent block rows can be hidden too. The old "Show fees and mempool" switch is
  now part of this list (if you had it off, nothing changes for you).
- **Faster first load.** Only the language you use is downloaded, not all of them: about a quarter less to load.
- **Block rows show there is more.** A row of blocks with more out of view fades out at that edge, and on a computer
  the mouse wheel scrolls it sideways.
- **Moscow time explained.** Hovering over it (or a screen reader) explains the clock-like number, and it links to
  the glossary.
- **Alarms on your phone, on your node.** On Umbrel, StartOS or the container with your own mempool, the Alarm page
  can send your block, fee and price alarms to your phone through [ntfy](https://ntfy.sh), even when no browser has
  BLOCKHORIZON open: your node watches them and sends each once, in your language.
- **日本語.** The app is now also in Japanese (9 languages in all), including the glossary and calendar.
- On narrow phones the Settings tabs wrap onto a second row instead of being cut off.

Earlier versions: see the [commit history](https://github.com/Random21m/BLOCKHORIZON/commits/main).
