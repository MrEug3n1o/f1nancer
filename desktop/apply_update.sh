#!/usr/bin/env bash
# Wait for the running F1nancer process to exit, then install from a DMG (or .app) and open it.
set -euo pipefail

APP_SRC="${1:?Usage: apply_update.sh <dmg-or-app> <pid> [dest]}"
WAIT_PID="${2:?Usage: apply_update.sh <dmg-or-app> <pid> [dest]}"
APP_DEST="${3:-${HOME}/Applications/F1nancer.app}"
LOG="${HOME}/Library/Application Support/F1nancer/apply_update.log"
MOUNT=""
ATTACHED_DEVICE=""

mkdir -p "${HOME}/Library/Application Support/F1nancer"
exec >>"$LOG" 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') apply_update start src=$APP_SRC pid=$WAIT_PID dest=$APP_DEST"

cleanup() {
  if [[ -n "${ATTACHED_DEVICE:-}" ]]; then
    hdiutil detach "$ATTACHED_DEVICE" -quiet -force >/dev/null 2>&1 || true
  elif [[ -n "${MOUNT:-}" ]]; then
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
if kill -0 "$WAIT_PID" 2>/dev/null; then
  echo "Process $WAIT_PID still alive; sending KILL"
  kill -9 "$WAIT_PID" 2>/dev/null || true
  sleep 1
fi

sleep 1

APP_FROM=""
if [[ -f "$APP_SRC" && "$APP_SRC" == *.dmg ]]; then
  echo "Attaching $APP_SRC"
  # Prefer hdiutil's chosen mount point — custom -mountpoint is flaky on some macOS versions.
  ATTACH_OUT="$(hdiutil attach -nobrowse -readonly "$APP_SRC")"
  echo "$ATTACH_OUT"
  ATTACHED_DEVICE="$(printf '%s\n' "$ATTACH_OUT" | awk '/^\/dev\// {print $1; exit}')"
  MOUNT="$(printf '%s\n' "$ATTACH_OUT" | awk '
    /^\/dev\// {
      mp=""
      for (i = 3; i <= NF; i++) {
        mp = (mp == "" ? $i : mp " " $i)
      }
      if (mp != "") { print mp; exit }
    }
  ')"
  if [[ -z "$MOUNT" || ! -d "$MOUNT" ]]; then
    echo "Could not determine DMG mount point"
    exit 1
  fi
  echo "Mounted at $MOUNT (device=${ATTACHED_DEVICE:-unknown})"
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

BIN_SRC="$APP_FROM/Contents/MacOS/F1nancer"
if [[ ! -x "$BIN_SRC" && ! -f "$BIN_SRC" ]]; then
  echo "Update package is missing Contents/MacOS/F1nancer"
  exit 1
fi

mkdir -p "$(dirname "$APP_DEST")"
# Never install onto a live DMG/volume path.
case "$APP_DEST" in
  /Volumes/*)
    echo "Refusing to install onto volume path $APP_DEST; using ~/Applications"
    APP_DEST="${HOME}/Applications/F1nancer.app"
    mkdir -p "$(dirname "$APP_DEST")"
    ;;
esac

rm -rf "$APP_DEST"
if command -v ditto >/dev/null 2>&1; then
  ditto "$APP_FROM" "$APP_DEST"
else
  cp -R "$APP_FROM" "$APP_DEST"
fi

xattr -cr "$APP_DEST" 2>/dev/null || true
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true
mdimport "$APP_DEST" >/dev/null 2>&1 || true
touch "$APP_DEST"
sleep 1

BIN_DEST="$APP_DEST/Contents/MacOS/F1nancer"
if [[ ! -f "$BIN_DEST" ]]; then
  echo "Install failed: missing $BIN_DEST"
  exit 1
fi
chmod +x "$BIN_DEST" 2>/dev/null || true

echo "Installed to $APP_DEST"
OPENED=0
if /usr/bin/open -n "$APP_DEST"; then
  OPENED=1
  echo "Opened via open -n"
else
  echo "open -n failed; trying open -a"
  if /usr/bin/open -a "$APP_DEST"; then
    OPENED=1
  fi
fi

if [[ "$OPENED" -ne 1 ]]; then
  echo "Launch Services open failed; launching binary directly"
  nohup "$BIN_DEST" >/dev/null 2>&1 &
  sleep 1
  if ! pgrep -f "$BIN_DEST" >/dev/null 2>&1; then
    echo "Failed to relaunch F1nancer"
    exit 1
  fi
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') apply_update done"
