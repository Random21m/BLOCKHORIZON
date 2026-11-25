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

`umbrel/blockhorizon/` holds the app definition in the layout of the Umbrel app store (`getumbrel/umbrel-apps`).
It depends on the Mempool app and reads from its web container at `${APP_MEMPOOL_IP}:${APP_MEMPOOL_PORT}`,
the address the Mempool app exports (its own widget server and other apps such as am-i-exposed use the same).
Port 3027 was free across the store when this was written. `umbrel/gallery/` has the three 1440x900 gallery images.

Ready:
- the image `ghcr.io/random21m/blockhorizon:v0.15.0` (amd64 and arm64, public), pinned by digest in `docker-compose.yml`
- the package passes Umbrel's linter (`npm run lint:apps -- blockhorizon --check-images`); the only error left is the
  empty `submission`, which is the link to the pull request itself
- the gallery images, for the pull request (Umbrel makes the final App Store images, so the manifest keeps `gallery: []`)
- the pull request text: `umbrel/PR-BODY.md`, following Umbrel's template

To submit:
1. Fork `getumbrel/umbrel-apps` on GitHub and copy `umbrel/blockhorizon/` into it as `blockhorizon/`.
2. Test it on your Umbrel: sync the folder into the device's app store directory and install it (Umbrel's
   `.agents/skills/umbrel-test-app/SKILL.md` has the commands), open it, restart it, and tick what you tested in
   the pull request text.
3. Open the pull request titled "Add BLOCKHORIZON" with `umbrel/PR-BODY.md` as its text and the three gallery images
   attached, then set `submission:` in your fork's `blockhorizon/umbrel-app.yml` to the pull request's link and push.

For a new version: bump VERSION in `src/state.js`, start the "Container image" workflow from the Actions tab
(it tags the image with the version), then update the image and digest here.

## Start9

StartOS packages are built with Start9's SDK as a separate wrapper repository around this image.
The container needs only `MEMPOOL_URL` pointed at the node's mempool service, so the wrapper is mostly
configuration; see Start9's packaging guide for the current SDK.
