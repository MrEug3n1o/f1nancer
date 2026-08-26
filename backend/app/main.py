import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.database import Base, SessionLocal, engine
from app.routers import (
    analytics,
    budgets,
    categories,
    currencies,
    deposits,
    goals,
    recurring,
    settings,
    system,
    transactions,
)
from app.schema_upgrade import ensure_schema
from app.seed import seed_database
from app.services.recurring import process_recurring_rules
from app.version import APP_VERSION


def _static_dir() -> Path | None:
    override = os.environ.get("F1NANCER_STATIC_DIR")
    if override:
        path = Path(override)
        return path if path.is_dir() else None
    # Dev fallback: repo frontend/dist when running uvicorn from backend/
    candidate = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return candidate if candidate.is_dir() else None


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema(engine)
    db = SessionLocal()
    try:
        seed_database(db)
        process_recurring_rules(db)
    finally:
        db.close()
    yield


app = FastAPI(title="F1nancer", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router, prefix="/api")
app.include_router(currencies.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(deposits.router, prefix="/api")
app.include_router(recurring.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(system.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/health")
def api_health():
    return {"status": "ok", "version": APP_VERSION}


STATIC_DIR = _static_dir()
if STATIC_DIR is not None:

    @app.get("/")
    def spa_index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
