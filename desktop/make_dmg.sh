#!/usr/bin/env bash
# Create a shareable F1nancer-<version>.dmg from desktop/dist/F1nancer.app
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP_SRC="$ROOT/desktop/dist/F1nancer.app"

if [[ ! -d "$APP_SRC" ]]; then
  echo "Missing $APP_SRC"
  echo "Build first: INSTALL=0 ./desktop/build.sh"
  exit 1
fi

VERSION="$(
  python3 - <<'PY'
from pathlib import Path
text = Path("backend/app/version.py").read_text(encoding="utf-8")
for line in text.splitlines():
    if line.startswith("APP_VERSION"):
        print(line.split("=", 1)[1].strip().strip("\"'"))
        break
else:
    print("0.0.0")
PY
)"

STAGE="$ROOT/desktop/dist/dmg-stage"
DMG_PATH="$ROOT/desktop/dist/F1nancer-${VERSION}.dmg"
VOL_NAME="F1nancer ${VERSION}"

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP_SRC" "$STAGE/F1nancer.app"
ln -s /Applications "$STAGE/Applications"

rm -f "$DMG_PATH"
hdiutil create \
  -volname "$VOL_NAME" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

rm -rf "$STAGE"

echo
echo "DMG ready: $DMG_PATH"
echo "Send this file to another Mac — open it and drag F1nancer to Applications."
