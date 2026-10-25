#!/bin/sh
# Envoie les 9 installateurs vers la release GitHub v0.1.0.
# Prérequis : gh auth login  (une fois, via le navigateur)
# Usage : sh scripts/upload-release.sh [tag]
set -eu
cd "$(dirname "$0")/.."

TAG="${1:-v0.1.0}"
REPO="DmzGamingYT/vela"

FILES="
release/mac/Vela-0.1.0-arm64.dmg
release/mac/Vela-0.1.0.dmg
release/mac/Vela-0.1.0-arm64-mac.zip
release/mac/Vela-0.1.0-mac.zip
release/win/Vela Setup 0.1.0.exe
release/linux/Vela-0.1.0-arm64.AppImage
release/linux/Vela-0.1.0.AppImage
release/linux/vela_0.1.0_amd64.deb
release/linux/vela_0.1.0_arm64.deb
"

missing=0
for f in $FILES; do
  if [ ! -f "$f" ]; then
    echo "MANQUANT: $f"
    missing=1
  fi
done
if [ "$missing" -eq 1 ]; then
  echo "Reconstruis d'abord : npm run dist:mac / dist:win / dist:linux"
  exit 1
fi

# shellcheck disable=SC2086
gh release upload "$TAG" $FILES --repo "$REPO" --clobber
echo "OK — https://github.com/$REPO/releases/tag/$TAG"
