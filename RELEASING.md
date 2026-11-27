# Releasing BLOCKHORIZON

A push to `main` deploys the site (`.github/workflows/pages.yml`). A release is that version, signed.

## Cutting a release (one command)

1. Push the release to `main` (the version in `src/state.js`, the cache name in `sw.js`, and a `## X.Y.Z` part in `CHANGELOG.md`),
   and wait for **Deploy to GitHub Pages** to pass (Actions tab).
2. On your own computer, in your clone of blockhorizon:

   ```bash
   git pull
   bash tools/release.sh 0.24.0
   ```

   It checks main is that version, makes `SHA256SUMS` (one line per file the site publishes) and checks every file on the live site
   is the one in main, shows you the checksums (compare them with the ones Claude gave you), and after you type `yes` signs them
   with the release key (gpg asks for the key's passphrase itself; the key never leaves your computer). Then it makes the GitHub
   release `v0.24.0` with that version's part of `CHANGELOG.md` and both files, downloads it again and checks the files, the
   signature and the tag. It stops at the first thing that does not match. It needs git, gpg, curl and the GitHub CLI
   (`gh auth login` once).

The script is tested with a throwaway key and stand-ins for GitHub and the site: `bash tests/release_script_test.sh`.
If you add a file or folder to the site in `pages.yml`, add it to `SITE_FILES` in `tools/release.sh` too.

## Checking a release

```bash
gpg --import blockhorizon-signing-key.asc
gpg --verify SHA256SUMS.asc SHA256SUMS          # a good signature by 2509 D115 03B7 2CBF BCB5  408F 4B72 9F05 6A52 9340
sha256sum -c SHA256SUMS                          # in a copy of the repository at that tag
```
