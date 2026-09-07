# F1nancer

Offline-first personal finance app for **desktop and mobile**. Track income and expenses, budgets, savings goals, recurring payments, and simple charts. Sign in with a username and password; the same account syncs across devices. Each device keeps a local SQLite copy and works fully offline.

## Stack

- **Desktop UI:** React + TypeScript + Vite (`frontend/`), bundled into the app
- **Mobile:** Expo / React Native (`mobile/`)
- **Sync:** Supabase (Auth + Postgres) + PowerSync (on-device SQLite)
- **Shared domain:** `@f1nancer/domain` (`packages/domain`)
- **Desktop shell:** pywebview + PyInstaller (`desktop/`) — macOS `.app`/DMG and Windows Setup.exe
- **Local engine (packaging / updates / legacy import):** FastAPI (`backend/`)

Cloud setup (migrations, username auth, PowerSync rules): see [`supabase/README.md`](supabase/README.md). Copy [`frontend/.env.example`](frontend/.env.example) and [`mobile/.env.example`](mobile/.env.example).

## Mac

Build and install a double-clickable app (Spotlight):

```bash
chmod +x desktop/build.sh desktop/install.sh desktop/make_dmg.sh
./desktop/build.sh
```

That packages `F1nancer.app` and copies it to `~/Applications` (so Spotlight finds it). No Desktop shortcut is created.

After install:

- **Spotlight:** `Cmd+Space` → type `F1nancer` → Enter
- **Applications:** open `~/Applications/F1nancer.app`

Re-install after a rebuild (without rebuilding again):

```bash
./desktop/install.sh
```

Build only (skip install): `INSTALL=0 ./desktop/build.sh`

### Shareable DMG (send to another Mac)

```bash
INSTALL=0 MAKE_DMG=1 ./desktop/build.sh
# or, if you already built the .app:
./desktop/make_dmg.sh
```

Send `desktop/dist/F1nancer-<version>.dmg`. On the other Mac: open the DMG → drag **F1nancer** to **Applications**. Unsigned builds may need **right-click → Open** the first time (Gatekeeper).

> A `.dmg` is macOS-only. For Windows, use the Setup.exe below — not a DMG.

## Windows

Download `F1nancer-<version>-setup.exe` from [Releases](https://github.com/MrEug3n1o/f1nancer/releases), double-click it, and finish the wizard. The app lands in the Start Menu (`%LOCALAPPDATA%\Programs\F1nancer`). Requires [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on most Windows 10/11 systems).

Build on a Windows machine (needs [Inno Setup](https://jrsoftware.org/isinfo.php)):

```powershell
.\desktop\build.ps1
```

That produces:

- `desktop\dist\F1nancer\` — runnable folder with `F1nancer.exe`
- `desktop\dist\F1nancer-<version>-setup.exe` — installer to send to another PC

If the app fails to open, check `%LOCALAPPDATA%\F1nancer\desktop.log`. Install [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) if the log mentions WebView2.

Skip the installer: `$env:MAKE_INSTALLER="0"; .\desktop\build.ps1`

Optional debug zip: `$env:MAKE_ZIP="1"; .\desktop\build.ps1`

### Build without a Windows PC

Push a `v*` tag or run the **App release** workflow (`workflow_dispatch`, [`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml)) on GitHub Actions. Either path publishes the Mac DMG, Windows Setup.exe, and Android APK as a GitHub Release. Manual runs tag the release as `v` plus `APP_VERSION` from `backend/app/version.py`.

Android CI needs GitHub secrets: `EXPO_TOKEN`, `EAS_PROJECT_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POWERSYNC_URL`. One-time local setup: `cd mobile && npx eas-cli login && npx eas-cli init`, paste the project id into `COMMITTED_EAS_PROJECT_ID` in [`mobile/app.config.js`](mobile/app.config.js) (or only use the `EAS_PROJECT_ID` secret), then run one interactive `npx eas-cli build -p android --profile apk` so EAS can create the Android keystore.

## In-app updates

**Mac & Windows:** Settings → **App updates** checks [GitHub Releases](https://github.com/MrEug3n1o/f1nancer/releases) and installs the latest desktop build. No Git, Node.js, or Python is required on the laptop.

- **Windows:** downloads `F1nancer-<version>-setup.exe` and runs it silently into `%LOCALAPPDATA%\Programs\F1nancer`
- **Mac:** downloads `F1nancer-<version>.dmg` and replaces the installed `F1nancer.app`

Your data stays in the app data folder. A source checkout cannot self-install from Settings — use `desktop/build.sh` or `desktop/build.ps1` instead.

**Android:** Account → **App updates** checks the same GitHub Releases feed for `F1nancer-<version>.apk`, downloads it, and opens the system installer. Confirm the Android install prompt (and allow installs from this app if asked). Local PowerSync data stays on the device.

## Desktop development (no packaging)

```bash
cd frontend && npm run build && cd ..
source backend/.venv/bin/activate   # Windows: backend\.venv\Scripts\activate
pip install -r desktop/requirements.txt
python desktop/run.py
```

### UI development

For hot-reload while editing the interface, run the local engine and Vite together:

```bash
cd backend
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to the local engine. Open the URL Vite prints (usually http://localhost:5173) only while developing the UI — this is not a shipped website.

## Backup

Signed-in data syncs to your F1nancer account. Each device also keeps a local SQLite database (PowerSync). Signing out clears the local copy on that device.

Legacy (pre-sync) desktop files can be imported from Settings after you sign in:

| Platform | Old database path |
|----------|-------------------|
| macOS | `~/Library/Application Support/F1nancer/f1nancer.db` |
| Windows | `%LOCALAPPDATA%\F1nancer\f1nancer.db` |
| Linux | `~/.local/share/F1nancer/f1nancer.db` |

## Mobile

### Download (Android)

Visitors can install from the [portfolio F1nancer page](https://yevhenii-dyl-portfolio.web.app/f1nancer) or [GitHub Releases](https://github.com/MrEug3n1o/f1nancer/releases) (`F1nancer-<version>.apk`).

On Android: open the APK → allow install from that source if prompted → Install. iOS is not available as a public download (App Store / TestFlight only).

### Development

```bash
cd mobile
cp .env.example .env
# fill Supabase + PowerSync URLs
npm install
npx expo start
```

Use the same username and password as desktop. Create a transaction in airplane mode, then reconnect — it should appear on desktop and in the Supabase table editor.

Production APK builds use EAS (`mobile/eas.json` profile `apk`) and bake in the three `EXPO_PUBLIC_*` values from CI secrets (not a committed `.env`).

## Features

- Transactions (income & expenses) with categories
- Monthly budgets with spent vs limit
- Savings goals with contributions
- Recurring payments / subscriptions (auto-create due transactions)
- Dashboard charts: month overview, spend by category, goal progress
- Currency setting (display only; amounts stored as integer cents)
