# F1nancer

Local-first personal finance app. Track income and expenses, budgets, savings goals, recurring payments, and simple charts. No login — data lives in a SQLite file on your machine.

## Stack

- **Backend:** FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Frontend:** React + TypeScript + Vite (`frontend/`)
- **Desktop:** pywebview + PyInstaller (`desktop/`) — macOS `.app`/DMG and Windows zip

## Run locally (web)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

The API is served under the `/api` prefix (e.g. `/api/transactions`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Mac desktop app

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

> A `.dmg` is macOS-only. For Windows, use the zip below — not a DMG.

## Windows desktop app

Build on a Windows machine (or download the CI artifact):

```powershell
.\desktop\build.ps1
```

That produces:

- `desktop\dist\F1nancer\` — runnable folder with `F1nancer.exe`
- `desktop\dist\F1nancer-<version>-windows.zip` — shareable archive

Unzip on the other PC and run `F1nancer.exe`. Requires [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on most Windows 10/11 systems).

Skip the zip step: `$env:MAKE_ZIP="0"; .\desktop\build.ps1`

### Build Windows zip without a Windows PC

Push a `v*` tag or run the **Desktop Windows** workflow (`workflow_dispatch`) on GitHub Actions, then download the `f1nancer-windows` artifact.

## In-app updates (Mac & Windows)

Settings → **App updates** can check GitHub (`main`) and rebuild from source on both platforms.

Prerequisites on the machine running the app:

| | Mac | Windows |
|---|-----|---------|
| Tools | Git, Node.js, Python 3 | Git, Node.js, Python 3 |
| Notes | Xcode Command Line Tools help with Git/Python | WebView2 for the UI |

After an update, Windows installs into `%LOCALAPPDATA%\Programs\F1nancer\` and relaunches from there.

## Desktop development (no packaging)

```bash
cd frontend && npm run build && cd ..
source backend/.venv/bin/activate   # Windows: backend\.venv\Scripts\activate
pip install -r desktop/requirements.txt
python desktop/run.py
```

## Backup

| Platform | Default database path |
|----------|------------------------|
| macOS | `~/Library/Application Support/F1nancer/f1nancer.db` |
| Windows | `%LOCALAPPDATA%\F1nancer\f1nancer.db` |
| Linux | `~/.local/share/F1nancer/f1nancer.db` |

Override the data directory with `F1NANCER_DATA_DIR` if needed.

## Features

- Transactions (income & expenses) with categories
- Monthly budgets with spent vs limit
- Savings goals with contributions
- Recurring payments / subscriptions (auto-create due transactions)
- Dashboard charts: month overview, spend by category, goal progress
- Currency setting (display only; amounts stored as integer cents)
