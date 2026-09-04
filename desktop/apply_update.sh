#!/usr/bin/env bash
# Wait for the running F1nancer process to exit, then install from a DMG (or .app) and open it.
set -euo pipefail

APP_SRC="${1:?Usage: apply_update.sh <dmg-or-app> <pid> [dest]}"
WAIT_PID="${2:?Usage: apply_update.sh <dmg-or-app> <pid> [dest]}"
APP_DEST="${3:-${HOME}/Applications/F1nancer.app}"
LOG="${HOME}/Library/Application Support/F1nancer/apply_update.log"
MOUNT=""

mkdir -p "${HOME}/Library/Application Support/F1nancer"
exec >>"$LOG" 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') apply_update start src=$APP_SRC pid=$WAIT_PID dest=$APP_DEST"

cleanup() {
  if [[ -n "${MOUNT:-}" ]]; then
    hdiutil detach "$MOUNT" -quiet -force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 240); do
  if ! kill -0 "$WAIT_PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if kill -0 "$WAIT_PID" 2>/dev/null; then
  echo "Process $WAIT_PID still alive; sending TERM"
  kill "$WAIT_PID" 2>/dev/null || true
  sleep 2
fi

sleep 1

APP_FROM=""
if [[ -f "$APP_SRC" && "$APP_SRC" == *.dmg ]]; then
  MOUNT="${TMPDIR:-/tmp}/f1nancer-update-mnt-$$"
  mkdir -p "$MOUNT"
  echo "Attaching $APP_SRC at $MOUNT"
  hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$APP_SRC"
  if [[ -d "$MOUNT/F1nancer.app" ]]; then
    APP_FROM="$MOUNT/F1nancer.app"
  else
    APP_FROM="$(find "$MOUNT" -maxdepth 2 -name 'F1nancer.app' -type d | head -n 1 || true)"
  fi
elif [[ -d "$APP_SRC" ]]; then
  APP_FROM="$APP_SRC"
fi

if [[ -z "$APP_FROM" || ! -d "$APP_FROM" ]]; then
  echo "Missing F1nancer.app in update package: $APP_SRC"
  exit 1
fi

mkdir -p "$(dirname "$APP_DEST")"
rm -rf "$APP_DEST"
if command -v ditto >/dev/null 2>&1; then
  ditto "$APP_FROM" "$APP_DEST"
else
  cp -R "$APP_FROM" "$APP_DEST"
fi

xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true
mdimport "$APP_DEST" >/dev/null 2>&1 || true
touch "$APP_DEST"

echo "Installed to $APP_DEST"
open "$APP_DEST"
echo "$(date '+%Y-%m-%d %H:%M:%S') apply_update done"
