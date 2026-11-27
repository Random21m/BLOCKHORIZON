#!/usr/bin/env bash
# BLOCKHORIZON release in one command. On your own computer, in your clone of blockhorizon, after main is pushed and the site has
# deployed (the "Deploy to GitHub Pages" run is green):
#
#   bash tools/release.sh 0.24.0
#
# 1. gets main from GitHub and checks it is this version (src/state.js and sw.js)
# 2. makes SHA256SUMS: one line per site file (the files the Pages workflow publishes), and checks every file on the live site is that one
# 3. shows you the checksums of the main files and, after you type yes, signs SHA256SUMS with your key (gpg asks for its passphrase itself)
# 4. makes the GitHub release vX: the notes (this version's part of CHANGELOG.md), SHA256SUMS and its signature
# 5. downloads the release again and checks the files, the signature and the tag
#
# Your private key never leaves this computer, and this script never sees its passphrase. Every step checks before it acts and
# stops at the first thing that does not match. Needs: git, gpg, gh (logged in: gh auth login), curl.
set -euo pipefail

RELEASE_KEY=2509D11503B72CBFBCB5408F4B729F056A529340   # the release key in blockhorizon-signing-key.asc
FPR=${BH_SIGNING_FPR:-$RELEASE_KEY}
REPO=${BH_REPO:-Random21m/blockhorizon}
REMOTE=${BH_REMOTE:-origin}
SITE=${BH_SITE:-https://random21m.github.io/BLOCKHORIZON}
# the files .github/workflows/pages.yml publishes (keep the two lists the same)
SITE_FILES=(index.html embed.html embed.css style.css sw.js manifest.webmanifest privacy.html config.json icons src docs)

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m  %s\n' "$*"; }
die()  { printf '\n\033[31mSTOP:\033[0m %s\nNothing after this point was done.\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is not installed. $2"; }
sha()  { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }

[ $# -eq 1 ] || { sed -n '2,15p' "$0"; exit 1; }
V=${1#v}
[[ $V =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "the version should look like 0.24.0"
TAG=v$V
need git "Install git."; need gpg "Install GnuPG."; need gh "Install the GitHub CLI and run: gh auth login"; need curl "Install curl."
git rev-parse --show-toplevel >/dev/null 2>&1 || die "run this inside your clone of blockhorizon."
cd "$(git rev-parse --show-toplevel)"
[ "$FPR" = "$RELEASE_KEY" ] || printf '\n\033[33mNOTE:\033[0m signing and checking with %s, NOT the release key (BH_SIGNING_FPR is set). Only for testing.\n' "$FPR"
case "$(git remote get-url "$REMOTE" 2>/dev/null)" in
  *"$REPO"|*"$REPO.git"|*"$REPO/") ;;
  *) [ -n "${BH_REMOTE_OK:-}" ] || die "the remote \"$REMOTE\" is $(git remote get-url "$REMOTE" 2>/dev/null || echo missing), not github.com/$REPO." ;;
esac
gpg --list-secret-keys "$FPR" >/dev/null 2>&1 || die "the release key $FPR is not on this computer."

say "1/5  Getting main from GitHub"
git fetch -q "$REMOTE" main || die "could not fetch main."
M=$(git rev-parse FETCH_HEAD)
ok "main is $(git log --oneline -1 "$M")"
PV=$(git show "$M:src/state.js" | grep -o "export const VERSION = '[0-9.]*'" | head -1 | grep -o "[0-9][0-9.]*" || true)
[ "$PV" = "$V" ] || die "main's src/state.js says it is ${PV:-no version}, not $V. Push the release to main first."
git show "$M:sw.js" | grep -q "const CACHE = 'blockhorizon-v$V';" || die "main's sw.js does not name the cache blockhorizon-v$V."
ok "main is $V (src/state.js and sw.js)"
! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1 || die "a GitHub release $TAG already exists."

say "2/5  The checksums of main's site files, and the live site"
D=".release/$TAG"; mkdir -p "$D"; rm -f "$D/SHA256SUMS" "$D/SHA256SUMS.asc" "$D/notes.md"; rm -rf "$D/check"
n=0
while IFS= read -r f; do
  h=$(git show "$M:$f" | sha)
  live=$(curl -fsS -H "Cache-Control: no-cache" "$SITE/$f?$(date +%s)" | sha) || die "could not download $SITE/$f."
  [ "$h" = "$live" ] || die "$f on the site is not the one in main. The site may not have deployed yet: wait until the Pages run is green, then run this again."
  printf '%s  %s\n' "$h" "$f" >> "$D/SHA256SUMS"; n=$((n + 1))
done < <(git ls-tree -r --name-only "$M" -- "${SITE_FILES[@]}" | LC_ALL=C sort)
[ "$n" -ge 1 ] || die "no site files found in main."
ok "$n site files: every one on the live site is the one in main"

say "3/5  Signing"
printf '  You are signing the checksums of %s files of main %s (the live site). The first lines:\n\n' "$n" "${M:0:7}"
head -5 "$D/SHA256SUMS" | sed 's/^/    /'
printf '    ...\n\n  SHA256SUMS itself: %s\n  It must match the one Claude gave you for this release. If it differs, do not sign.\n' "$(sha < "$D/SHA256SUMS")"
read -r -p "  Type yes to sign it with $FPR: " a; [ "$a" = yes ] || die "not signed (you did not type yes)."
gpg --local-user "$FPR" --armor --detach-sign --yes --output "$D/SHA256SUMS.asc" "$D/SHA256SUMS"
gpg --status-fd 1 --verify "$D/SHA256SUMS.asc" "$D/SHA256SUMS" 2>/dev/null | grep -q "^\[GNUPG:\] VALIDSIG $FPR " || die "the new signature does not verify as made by $FPR."
ok "SHA256SUMS.asc is a good signature by $FPR"

say "4/5  Making the GitHub release $TAG"
git show "$M:CHANGELOG.md" | awk -v v="## $V" '$0 == v {on = 1; next} on && /^## / {exit} on' > "$D/notes.md"
[ -s "$D/notes.md" ] || die "CHANGELOG.md in main has no \"## $V\" part for the notes."
{ printf '\nSHA256SUMS (signed with the release key %s, see blockhorizon-signing-key.asc) lists every file of the site at this version:\n```\ngpg --verify SHA256SUMS.asc SHA256SUMS\n```\n' "$FPR"; } >> "$D/notes.md"
gh release create "$TAG" -R "$REPO" --target "$M" --title "BLOCKHORIZON $TAG" --notes-file "$D/notes.md" "$D/SHA256SUMS" "$D/SHA256SUMS.asc" >/dev/null
ok "released: https://github.com/$REPO/releases/tag/$TAG"

say "5/5  Checking the release"
mkdir -p "$D/check"
gh release download "$TAG" -R "$REPO" -D "$D/check" -p SHA256SUMS -p SHA256SUMS.asc >/dev/null || die "could not download the release files again."
cmp -s "$D/check/SHA256SUMS" "$D/SHA256SUMS" && cmp -s "$D/check/SHA256SUMS.asc" "$D/SHA256SUMS.asc" || die "the files on the release page are not the ones signed here."
gpg --status-fd 1 --verify "$D/check/SHA256SUMS.asc" "$D/check/SHA256SUMS" 2>/dev/null | grep -q "^\[GNUPG:\] VALIDSIG $FPR " || die "the signature on the release page does not verify."
git fetch -q "$REMOTE" "refs/tags/$TAG:refs/tags/$TAG" 2>/dev/null || true
[ "$(git rev-parse "$TAG^{commit}" 2>/dev/null || true)" = "$M" ] || die "the tag $TAG on GitHub is not main ($M)."
ok "the release page holds the signed checksums, and $TAG is main ${M:0:7}"
say "Done. Tell Claude \"published\"."
