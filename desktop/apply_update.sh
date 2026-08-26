#!/usr/bin/env bash
# Wait for the running F1nancer process to exit, then install the new .app and open it.
set -euo pipefail

APP_SRC="${1:?Usage: apply_update.sh /path/to/F1nancer.app <pid>}"
WAIT_PID="${2:?Usage: apply_update.sh /path/to/F1nancer.app <pid>}"
APP_DEST="${HOME}/Applications/F1nancer.app"

if [[ ! -d "$APP_SRC" ]]; then
  echo "Missing built app: $APP_SRC" >&2
  exit 1
fi

# Wait until the old process is gone (or give up after ~2 minutes).
for _ in $(seq 1 240); do
  if ! kill -0 "$WAIT_PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

# Brief pause so macOS releases file locks on the old bundle.
sleep 1

mkdir -p "${HOME}/Applications"
rm -rf "$APP_DEST"
cp -R "$APP_SRC" "$APP_DEST"
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true
mdimport "$APP_DEST" >/dev/null 2>&1 || true
touch "$APP_DEST"

open "$APP_DEST"
