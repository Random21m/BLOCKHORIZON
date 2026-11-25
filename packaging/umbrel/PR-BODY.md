<!-- Title: Add BLOCKHORIZON -->

## Type

New app

## App

App ID: blockhorizon
Upstream project: https://github.com/Random21m/BLOCKHORIZON
Version: 0.15.1

## Summary

BLOCKHORIZON is a calm, live Bitcoin dashboard where time is measured in blocks: block height, next halving,
difficulty adjustment, hashrate, fees, mempool, projected and recent blocks, a live picture of the next block
being mined, alarms, a clock mode, history charts and "your block".

On Umbrel it depends on the Mempool app. The container (nginx serving the static app) proxies `/api`
(REST and websocket) to the Mempool app's web container at `${APP_MEMPOOL_IP}:${APP_MEMPOOL_PORT}`, the address
the Mempool app exports (the same address its own widget server uses), so the browser asks only the Umbrel for
block, fee and mempool data. The price comes from Kraken's public feed. The app has no accounts and keeps its
settings in the browser, so it stores nothing on the device.

Image: `ghcr.io/random21m/blockhorizon:v0.15.1`, built from the upstream repository's Dockerfile by its
"Container image" workflow; public, linux/amd64 and linux/arm64, pinned by index digest.

## Verification

Umbrel testing performed:

Environment tested:
- [ ] Umbrel device
- [ ] Local umbrelOS test environment
- [ ] Not runtime tested

Architecture tested:
- [ ] amd64
- [ ] arm64

`npm run lint:apps -- blockhorizon --check-images` passes. Outside Umbrel, the same image was run with
`MEMPOOL_URL` pointed at a mempool server: all mempool requests, including the live websocket, went through
the container's `/api` proxy.

Known lint warnings or caveats: none.

## Notes

- Dependencies: mempool.
- No permissions, no data mounts, no default credentials. Umbrel auth is left on.
- `storage: dataRoot: data` is included as recommended, although the app writes no data.
- The container runs nginx as root (the stock nginx image's entrypoint writes the proxy config at start).

Screenshots (1440x900): attach `packaging/umbrel/gallery/1.jpg`, `2.jpg` and `3.jpg` from the upstream
repository. Logo: https://github.com/Random21m/BLOCKHORIZON/blob/main/icons/icon.svg
