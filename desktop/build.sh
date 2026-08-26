#!/usr/bin/env bash
# Build F1nancer.app for local Mac use (optional DMG via MAKE_DMG=1).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm install)
fi

echo "Building frontend..."
(cd frontend && npm run build)

PYTHON="${PYTHON:-python3}"
if [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
  PYTHON="$ROOT/backend/.venv/bin/python"
elif [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
fi

echo "Using Python: $PYTHON"
"$PYTHON" -m pip install -r backend/requirements.txt -r desktop/requirements.txt

# Stamp git revision for in-app update checks (first launch seeds DATA_DIR).
REVISION="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "$REVISION" > "$ROOT/desktop/installed_revision.txt"
echo "Revision: $REVISION"

echo "Packaging F1nancer.app..."
"$PYTHON" -m PyInstaller desktop/f1nancer.spec --noconfirm --distpath desktop/dist --workpath desktop/build

# Also place stamp next to onedir / Resources for seed_installed_revision_from_bundle.
if [[ -d "$ROOT/desktop/dist/F1nancer" ]]; then
  cp "$ROOT/desktop/installed_revision.txt" "$ROOT/desktop/dist/F1nancer/installed_revision.txt"
fi
if [[ -d "$ROOT/desktop/dist/F1nancer.app" ]]; then
  cp "$ROOT/desktop/installed_revision.txt" \
    "$ROOT/desktop/dist/F1nancer.app/Contents/MacOS/installed_revision.txt" 2>/dev/null || true
  RES="$ROOT/desktop/dist/F1nancer.app/Contents/Resources"
  if [[ -d "$RES" ]]; then
    cp "$ROOT/desktop/installed_revision.txt" "$RES/installed_revision.txt" 2>/dev/null || true
  fi
fi

echo
echo "Done: $ROOT/desktop/dist/F1nancer.app"

if [[ "${MAKE_DMG:-0}" == "1" ]]; then
  "$ROOT/desktop/make_dmg.sh"
fi

if [[ "${INSTALL:-1}" == "1" ]]; then
  echo "Installing to ~/Applications..."
  "$ROOT/desktop/install.sh"
else
  echo "Open with: open desktop/dist/F1nancer.app"
  echo "Or install for Spotlight: ./desktop/install.sh"
  echo "Or make a shareable DMG: MAKE_DMG=1 INSTALL=0 ./desktop/build.sh"
fi

echo "First launch may require right-click → Open (unsigned local build)."
