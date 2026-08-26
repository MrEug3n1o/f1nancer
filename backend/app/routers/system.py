"""System / About / in-app update endpoints."""

from fastapi import APIRouter, HTTPException, Request

from app import update_service
from app.version import APP_VERSION, DEFAULT_BRANCH, GITHUB_REPO

router = APIRouter(prefix="/system", tags=["system"])


def _require_localhost(request: Request) -> None:
    host = (request.client.host if request.client else "") or ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(
            status_code=403,
            detail="App updates are only available from this machine.",
        )


@router.get("/info")
def system_info():
    state = update_service.snapshot()
    return {
        "version": APP_VERSION,
        "github_repo": GITHUB_REPO,
        "branch": DEFAULT_BRANCH,
        "current_sha": state.get("current_sha"),
        "latest_sha": state.get("latest_sha"),
        "update_available": state.get("update_available"),
        "status": state.get("status"),
        "message": state.get("message"),
        "error": state.get("error"),
        "can_update": state.get("can_update", True),
        "log": state.get("log", ""),
    }


@router.get("/update")
def update_status(request: Request):
    _require_localhost(request)
    return update_service.snapshot()


@router.post("/update/check")
def check_update(request: Request):
    _require_localhost(request)
    return update_service.check_for_updates()


@router.post("/update")
def start_update(request: Request):
    _require_localhost(request)
    return update_service.start_update()


@router.post("/update/relaunch")
def relaunch_update(request: Request):
    _require_localhost(request)
    try:
        return update_service.relaunch_updated_app()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
