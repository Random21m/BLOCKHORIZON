# BLOCKHORIZON

**Live site: https://random21m.github.io/blockhorizon/** (open it in your browser; it can be installed as an app from the browser menu)

BLOCKHORIZON is a live Bitcoin dashboard built around one idea: in Bitcoin, time is measured in blocks. It shows where the chain is right now and what comes next: the current block, the countdown to the next halving and difficulty adjustment, fees and the mempool, hashrate, price and sats per dollar.

It is a static, installable page with a calm, flat look (no flashing, no glow), running on free public data. No accounts, no ads, no tracking. Open it and watch the horizon move one block at a time.

## Features (v0.4.1)
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
- Block alarm with sounds, calculator (sats/fiat, height/date), halving replay, chain calendar, glossary
- Settings: dark/light/auto, currency, sats symbol, time/date format, UTC, language (English, German, Spanish), sounds, reduced motion, full screen
- Installable PWA that works offline (cached shell and last values)

Not built yet: art gallery, conference listings, chain-state totals (addresses, UTXOs, disk size: no free public source found).

## Develop and test
```
node --test tests/lib.test.mjs     # unit tests on recorded API responses (tests/fixtures)
node tests/smoke.mjs               # Playwright smoke test with the API mocked
python3 -m http.server 8080        # then open http://localhost:8080
```
No build step, no dependencies. Data comes from the public mempool.space API and Kraken's public price feed; nothing else is contacted and nothing is tracked.
