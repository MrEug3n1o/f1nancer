# F1nancer

Local-first personal finance app. Track income and expenses, budgets, savings goals, recurring payments, and simple charts. No login — data lives in a SQLite file on your machine.

## Stack

- **Backend:** FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Frontend:** React + TypeScript + Vite (`frontend/`)
- **Desktop (Mac):** pywebview + PyInstaller (`desktop/`)

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
chmod +x desktop/build.sh desktop/install.sh
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

Unsigned local builds may need **right-click → Open** the first time (Gatekeeper).

For day-to-day desktop development without packaging:

```bash
cd frontend && npm run build && cd ..
source backend/.venv/bin/activate
pip install -r desktop/requirements.txt
python desktop/run.py
```

## Backup

Copy `~/Library/Application Support/F1nancer/f1nancer.db` to back up your data.

Override the data directory with `F1NANCER_DATA_DIR` if needed.

## Features

- Transactions (income & expenses) with categories
- Monthly budgets with spent vs limit
- Savings goals with contributions
- Recurring payments / subscriptions (auto-create due transactions)
- Dashboard charts: month overview, spend by category, goal progress
- Currency setting (display only; amounts stored as integer cents)
