# BLOCKHORIZON

**Live site: https://random21m.github.io/BLOCKHORIZON/** (open it in your browser; it can be installed as an app from the browser menu)

BLOCKHORIZON is a live Bitcoin dashboard built around one idea: in Bitcoin, time is measured in blocks. It shows where the chain is right now and what comes next: the current block, the countdown to the next halving and difficulty adjustment, fees and the mempool, hashrate, price and sats per dollar.

It is a static, installable page with a calm, flat look (no flashing, no glow), running on free public data. No accounts, no ads, no tracking. Open it and watch the horizon move one block at a time.

## Install

BLOCKHORIZON is a web app: open https://random21m.github.io/BLOCKHORIZON/ and you are already using it. To keep it one tap away, install it as an app. It then opens in its own window, works offline with the last values it saw, and updates itself.

| Where | How |
|---|---|
| **iPhone / iPad (Safari)** | Tap the Share button, then **Add to Home Screen**, then **Add**. |
| **Android (Chrome)** | Tap the menu (three dots), then **Install app** (or **Add to Home screen**). |
| **Windows / Mac / Linux (Chrome or Edge)** | Click the install icon at the right end of the address bar, or open the menu and choose **Install BLOCKHORIZON**. |
| **Mac (Safari 17 or newer)** | **File**, then **Add to Dock**. |
| **Firefox on desktop** | Firefox cannot install web apps. Bookmark the page instead; everything else works. |

Settings (currency, language, time format, theme, sounds) are kept only in your own browser. To remove the app, uninstall it like any other app or clear the site data.

### Run your own copy
There is nothing to build: the site is plain static files, so any static host works (it must be served over HTTPS, or from `localhost`, so that the offline mode can start).

- **On your computer:** clone this repository and run `python3 -m http.server 8080` in it, then open http://localhost:8080.
- **On GitHub Pages:** fork the repository, open **Settings, Pages** and set **Source** to **GitHub Actions**. The included workflow publishes the site on every push to `main` (you can also start it by hand from the **Actions** tab).
- **Anywhere else:** upload `index.html`, `style.css`, `sw.js`, `manifest.webmanifest`, `privacy.html`, `.nojekyll` and the `icons` and `src` folders. The file paths are relative, so it also works in a sub-folder.

## Features (v0.5.6)
- Everything on one screen, no scrolling: a tile grid that fills desktop, laptop and phone
- Live block height clock with an optional sound and the time since the last block
- Next halving (arc, blocks to go, estimated date, reward) and supply issued
- Difficulty adjustment (progress, expected change, previous change)
- Hashrate with 7/14/30/90-day averages, block production vs the 10-minute target, last block details with mining pool
- Fees, mempool (count, depth, inflow), projected blocks, recent blocks strip
- Block colours follow the mempool.space convention (fee-rate colours for upcoming blocks, purple to blue for mined blocks), drawn flat
- Live Bitcoin price streamed from Kraken's public feed (mempool.space as fallback), shown under the block height with the 24 h change
- Price in 7 currencies, sats per unit, Moscow time, market cap; Lightning network capacity
- Search by block height or date, block pages with permalinks (`#/block/840000`)
- Watch page: Bitcoin YouTube channels, A to Z, plus a few sites (The Lot Radio)
- Block alarm with sounds, calculator (sats/fiat, height/date), halving replay, chain calendar, glossary
- Settings: dark/light/auto, currency, sats symbol, time/date format, UTC, language (English, German, Spanish, French, Portuguese, Italian, Dutch, Turkish), sounds, reduced motion, full screen
- Installable PWA that works offline (cached shell and last values) and updates itself on the next open; pull down from the top (or tap ↻) to refresh

Not built yet: art gallery, conference listings, chain-state totals (addresses, UTXOs, disk size: no free public source found).

## Develop and test
```
node --test tests/lib.test.mjs     # unit tests on recorded API responses (tests/fixtures)
node tests/smoke.mjs               # Playwright smoke test with the API mocked
python3 -m http.server 8080        # then open http://localhost:8080
```
No build step, no dependencies. Data comes from the public mempool.space API and Kraken's public price feed; nothing else is contacted and nothing is tracked.

## Support
If BLOCKHORIZON is useful to you, you can send a tip over Lightning:

<img src="docs/support-qr.svg" alt="QR code for the Lightning address below" width="220">

`npub1vj8zjhnmkhekv93e2xmrz7kfwuxq25vrzw53u4dqhwd2lp5smvks3mwu2n@npub.cash`

(An npub.cash Lightning address: scan the QR code or paste the address into any Lightning wallet.)
