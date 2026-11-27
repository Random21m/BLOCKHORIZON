# Running BLOCKHORIZON on your own node

The site is static files, so it runs anywhere. The container in this repository adds one thing: with
`MEMPOOL_URL` set, it proxies `/api` (REST and the live websocket) to that mempool server and points the app at it,
so the browser only talks to your node (and to Kraken, or Coinbase while Kraken is down, for the price). If the node's
mempool is not answering, the app says it is offline; it never asks blockstream.info or any other server in its place.

## Docker

```bash
docker build -t blockhorizon .
docker run -d -p 8080:80 -e MEMPOOL_URL=http://<your-node>:<mempool-port> blockhorizon
```

Leave out `MEMPOOL_URL` to use mempool.space. Published images (amd64 and arm64) are built by
`.github/workflows/docker.yml` when a `v*` tag is pushed: `ghcr.io/random21m/blockhorizon:<tag>`.
After the first publish, make the package public under the repository's **Packages** settings so nodes can pull it.

## Phone notifications

With `MEMPOOL_URL` set, the container can also send alarms to a phone while no browser is open. The Alarm page then
shows **On your phone**: you install the free [ntfy](https://ntfy.sh) app, subscribe to the topic it suggests (a random
name, since anyone who knows an ntfy.sh topic's name can read it; your own ntfy server works too) and turn it on.

How it works: each browser that turns it on sends its alarms to `PUT /push/sync` (its whole list, whenever it changes
and on every start, with the messages already written in its language). `packaging/push.js` runs inside nginx (the
njs module that ships with the official image, so nothing else is installed) and once a minute reads the node's
mempool through the container's own `/api` proxy, only while alarms are waiting. Each alarm that is reached is posted
to the browser's ntfy topic once, then removed. Alarms already reached when they arrive are left to the open browser.

Watched addresses (Alarm page, **Watch an address**, up to 10 per browser) are the exception: they stay. For each one the
node reads `/api/address/<address>/txs` once a minute and posts a message for each new incoming payment: one when it is
first seen waiting, one when it is confirmed. What is at an address when it is first watched is only noted. Addresses
are only looked up on the node; the browser also looks them up itself while it is open, but only through this node's
`/api` (never another data server).

Waiting alarms are kept in `/var/lib/blockhorizon` (a volume: on Umbrel `${APP_DATA_DIR}/data`). Without a volume
nothing important is lost on a restart: the browsers send their alarms again the next time they open. The container
needs to reach the ntfy server (ntfy.sh, or yours) for this; nothing is sent anywhere while it is turned off.

`node tests/push.mjs` tests it in a real nginx with njs (`apt install nginx libnginx-mod-http-js`) against a fake
mempool and a fake ntfy server, as CI does.

## Without the container

Any copy of the site can use your node: open **Settings, Data** and enter your mempool's address (it must allow
cross-origin requests, and on an https page it must be https too). A self-hosted copy can also set the default in
`config.json`: `{ "server": "https://mempool.example.com" }`, or `"self"` when the same web server proxies `/api`.

## Umbrel

Submitted to the Umbrel App Store as [getumbrel/umbrel-apps#6425](https://github.com/getumbrel/umbrel-apps/pull/6425),
from the `add-blockhorizon` branch of the fork `Random21m/umbrel-apps`. `umbrel/blockhorizon/` here is a copy of the
submitted folder; keep the two identical.

It depends on the Mempool app and reads from its web container at `${APP_MEMPOOL_IP}:${APP_MEMPOOL_PORT}`, the
address the Mempool app exports (its own widget server and other apps such as am-i-exposed use the same). Port 3027
was free across the store when it was submitted. `umbrel/gallery/` holds the screenshots shown in the pull request;
the manifest keeps `gallery: []` because Umbrel makes the final App Store images. `umbrel/PR-BODY.md` is the pull
request text.

For a new version:
1. Bump VERSION in `src/state.js`, merge, then start the "Container image" workflow from the Actions tab (it tags the
   image with the version).
2. Read the new image's index digest: `docker buildx imagetools inspect ghcr.io/random21m/blockhorizon:v<version>`.
3. In both `umbrel/blockhorizon/` here and the fork's `blockhorizon/`, update `version:` in `umbrel-app.yml` and the
   image tag and digest in `docker-compose.yml`, then run Umbrel's linter in the fork:
   `npm run lint:apps -- blockhorizon --check-images`.
4. Push the fork branch (that updates the pull request, or opens an update once the app is in the store).
