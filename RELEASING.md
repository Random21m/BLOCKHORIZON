# Releasing BLOCKHORIZON

A push to `main` deploys the site (`.github/workflows/pages.yml`). A release is that version, signed.

## Cutting a release (one paste)

1. Claude pushes the release to `main` with your OK (the version in `src/state.js`, the cache name in `sw.js`, and a
   `## X.Y.Z` part in `CHANGELOG.md`), and the **Deploy to GitHub Pages** run passes.
2. On your own computer, in any terminal, paste this one line (the same line for every project):

   ```bash
   bash <(gh api -H "Accept: application/vnd.github.raw" repos/Random21m/second-brain/contents/how-to/release-kit/release-all.sh)
   ```

   It finds every project whose new version is live but not released, and for each runs `tools/release.sh` from main: it
   checks main's version, checks every file on the live site is the one in main, signs `SHA256SUMS` with the release key (gpg
   asks for the key's passphrase, if it has one; the key never leaves your computer), makes the GitHub release with that
   version's part of `CHANGELOG.md`, and checks it. It stops at the first thing that does not match.

By hand, in this clone: `bash tools/release.sh` (it reads the version from main). Needs git, gpg, curl and the GitHub CLI
(`gh auth login` once). The repo's details are in `tools/release.conf`; the script is the same in every project. It is tested
with a throwaway key and stand-ins for GitHub and the site: `bash tests/release_script_test.sh`.
If you add a file or folder to the site in `pages.yml`, add it to `SITE_FILES` in `tools/release.conf` too.

## Checking a release

```bash
gpg --import blockhorizon-signing-key.asc
gpg --verify SHA256SUMS.asc SHA256SUMS          # a good signature by 2509 D115 03B7 2CBF BCB5  408F 4B72 9F05 6A52 9340
sha256sum -c SHA256SUMS                          # in a copy of the repository at that tag
```
