#!/usr/bin/env bash
# Wait for the running F1nancer process to exit, then install the new .app and open it.
set -euo pipefail

APP_SRC="${1:?Usage: apply_update.sh /path/to/F1nancer.app <pid>}"
WAIT_PID="${2:?Usage: apply_update.sh /path/to/F1nancer.app <pid>}"
APP_DEST="${HOME}/Applications/F1nancer.app"
LOG="${HOME}/Library/Application Support/F1nancer/apply_update.log"

mkdir -p "${HOME}/Library/Application Support/F1nancer"
exec >>"$LOG" 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') apply_update start src=$APP_SRC pid=$WAIT_PID"

if [[ ! -d "$APP_SRC" ]]; then
  echo "Missing built app: $APP_SRC"
  exit 1
fi

for _ in $(seq 1 240); do
  if ! kill -0 "$WAIT_PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

# If the process is still alive, try a gentle terminate then continue.
if kill -0 "$WAIT_PID" 2>/dev/null; then
  echo "Process $WAIT_PID still alive; sending TERM"
  kill "$WAIT_PID" 2>/dev/null || true
  sleep 2
fi

sleep 1

mkdir -p "${HOME}/Applications"

# Prefer ditto for a cleaner Mac bundle copy.
rm -rf "$APP_DEST"
if command -v ditto >/dev/null 2>&1; then
  ditto "$APP_SRC" "$APP_DEST"
else
  cp -R "$APP_SRC" "$APP_DEST"
fi

xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true
mdimport "$APP_DEST" >/dev/null 2>&1 || true
touch "$APP_DEST"

echo "Installed to $APP_DEST"
open "$APP_DEST"
echo "$(date '+%Y-%m-%d %H:%M:%S') apply_update done"
