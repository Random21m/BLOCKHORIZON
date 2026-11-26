# Changelog

What changed in each version of BLOCKHORIZON, newest first. The version is shown at the bottom of the app.

## Unreleased

- **Five more languages: Bahasa Indonesia, Tiếng Việt, हिन्दी, Polski and Українська.** 18 languages in all,
  glossary and calendar included. A browser set to one of them gets its language on its own. These are machine
  translations for now; corrections from native speakers are welcome.

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
