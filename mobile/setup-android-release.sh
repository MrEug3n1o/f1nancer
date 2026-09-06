#!/usr/bin/env bash
# One-shot: GitHub auth (if needed) → push → set release secrets → print Expo next steps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null; then
  echo "Install GitHub CLI first: https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Logging into GitHub CLI…"
  gh auth login --hostname github.com --git-protocol https --web
fi

gh auth status

echo "Pushing main…"
git push -u origin HEAD

ENV_FILE="$ROOT/mobile/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing mobile/.env — copy from mobile/.env.example and fill values." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${EXPO_PUBLIC_SUPABASE_URL:?Set EXPO_PUBLIC_SUPABASE_URL in mobile/.env}"
: "${EXPO_PUBLIC_SUPABASE_ANON_KEY:?Set EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env}"
: "${EXPO_PUBLIC_POWERSYNC_URL:?Set EXPO_PUBLIC_POWERSYNC_URL in mobile/.env}"

echo "Setting GitHub Actions secrets from mobile/.env…"
gh secret set EXPO_PUBLIC_SUPABASE_URL --body "$EXPO_PUBLIC_SUPABASE_URL"
gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY --body "$EXPO_PUBLIC_SUPABASE_ANON_KEY"
gh secret set EXPO_PUBLIC_POWERSYNC_URL --body "$EXPO_PUBLIC_POWERSYNC_URL"

if [[ -n "${EXPO_TOKEN:-}" ]]; then
  gh secret set EXPO_TOKEN --body "$EXPO_TOKEN"
  echo "Set EXPO_TOKEN from environment."
else
  echo
  echo "Still needed: EXPO_TOKEN"
  echo "  1) https://expo.dev/settings/access-tokens → create token"
  echo "  2) gh secret set EXPO_TOKEN"
fi

if [[ -n "${EAS_PROJECT_ID:-}" ]]; then
  gh secret set EAS_PROJECT_ID --body "$EAS_PROJECT_ID"
  echo "Set EAS_PROJECT_ID from environment."
else
  # Project created on expo.dev for this repo
  EAS_PROJECT_ID="bd86d831-ef3d-495d-ac7e-02ef99e11a1b"
  gh secret set EAS_PROJECT_ID --body "$EAS_PROJECT_ID"
  echo "Set EAS_PROJECT_ID=$EAS_PROJECT_ID"
fi

echo
echo "When EXPO_TOKEN + EAS_PROJECT_ID secrets exist, create the Android keystore once:"
echo "  cd mobile && npx eas-cli build -p android --profile apk"
echo "Then run the release:"
echo "  gh workflow run desktop-release.yml --ref main"
echo "Done with GitHub push + Supabase/PowerSync secrets."
