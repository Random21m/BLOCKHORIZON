# Running BLOCKHORIZON on your own node

The site is static files, so it runs anywhere. The container in this repository adds one thing: with
`MEMPOOL_URL` set, it proxies `/api` (REST and the live websocket) to that mempool server and points the app at it,
so the browser only talks to your node (and to Kraken for the price).

## Docker

```bash
docker build -t blockhorizon .
docker run -d -p 8080:80 -e MEMPOOL_URL=http://<your-node>:<mempool-port> blockhorizon
```

Leave out `MEMPOOL_URL` to use mempool.space. Published images (amd64 and arm64) are built by
`.github/workflows/docker.yml` when a `v*` tag is pushed: `ghcr.io/random21m/blockhorizon:<tag>`.
After the first publish, make the package public under the repository's **Packages** settings so nodes can pull it.

## Without the container

Any copy of the site can use your node: open **Settings, Data** and enter your mempool's address (it must allow
cross-origin requests, and on an https page it must be https too). A self-hosted copy can also set the default in
`config.json`: `{ "server": "https://mempool.example.com" }`, or `"self"` when the same web server proxies `/api`.

## Umbrel

`umbrel/blockhorizon/` holds the app definition in the layout of the Umbrel app store
(`getumbrel/umbrel-apps`): it depends on the Mempool app and reads from its `web` container.
To submit it:

1. Push a tag (`git tag v0.15.0 && git push origin v0.15.0`) so the image is published, make it public, and pin
   its digest in `docker-compose.yml`.
2. Test it on an Umbrel (see the umbrel-apps README for installing an app from a fork), and check that
   `mempool_web_1:3006` is still the Mempool app's address in the current Umbrel release.
3. Add three gallery images (1440x900) and open a pull request to `getumbrel/umbrel-apps` with this folder.

The port (3021) must not clash with another app in the store; pick a free one if the review asks.

## Start9

StartOS packages are built with Start9's SDK as a separate wrapper repository around this image.
The container needs only `MEMPOOL_URL` pointed at the node's mempool service, so the wrapper is mostly
configuration; see Start9's packaging guide for the current SDK.
