#!/usr/bin/env bash
# Install F1nancer.app to ~/Applications for Spotlight (no Desktop shortcut).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SRC="$ROOT/desktop/dist/F1nancer.app"
APP_DEST="${HOME}/Applications/F1nancer.app"

if [[ ! -d "$APP_SRC" ]]; then
  echo "Missing $APP_SRC"
  echo "Build first: ./desktop/build.sh"
  exit 1
fi

mkdir -p "${HOME}/Applications"
rm -rf "$APP_DEST"
cp -R "$APP_SRC" "$APP_DEST"
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true

# Help Spotlight pick it up
mdimport "$APP_DEST" >/dev/null 2>&1 || true
touch "$APP_DEST"

echo
echo "Installed to: $APP_DEST"
echo
echo "Open via Spotlight: press Cmd+Space, type F1nancer, Enter"
echo "Or: open ~/Applications/F1nancer.app"
echo "First launch may need right-click → Open (unsigned local build)."
