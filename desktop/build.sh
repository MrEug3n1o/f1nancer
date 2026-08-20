#!/usr/bin/env bash
# Build F1nancer.app for local Mac use.
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

echo "Packaging F1nancer.app..."
"$PYTHON" -m PyInstaller desktop/f1nancer.spec --noconfirm --distpath desktop/dist --workpath desktop/build

echo
echo "Done: $ROOT/desktop/dist/F1nancer.app"

if [[ "${INSTALL:-1}" == "1" ]]; then
  echo "Installing to ~/Applications..."
  "$ROOT/desktop/install.sh"
else
  echo "Open with: open desktop/dist/F1nancer.app"
  echo "Or install for Spotlight: ./desktop/install.sh"
fi

echo "First launch may require right-click → Open (unsigned local build)."
