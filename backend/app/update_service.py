"""In-app update: sync a managed checkout from GitHub, rebuild, and relaunch."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.database import DATA_DIR
from app.version import (
    APP_VERSION,
    DEFAULT_BRANCH,
    GITHUB_CLONE_URL,
    GITHUB_REPO,
)

MANAGED_SRC = DATA_DIR / "src"
INSTALLED_REVISION_FILE = DATA_DIR / "installed_revision.txt"
UPDATE_LOG_TAIL = 80


@dataclass
class UpdateState:
    status: str = "idle"
    # idle | checking | up_to_date | available | updating | ready | failed | relaunching
    message: str = ""
    error: str | None = None
    current_version: str = APP_VERSION
    current_sha: str | None = None
    latest_sha: str | None = None
    update_available: bool = False
    can_update: bool = True
    log_lines: list[str] = field(default_factory=list)
    started_at: float | None = None
    finished_at: float | None = None


_lock = threading.Lock()
_state = UpdateState()
_worker: threading.Thread | None = None


def _append_log(line: str) -> None:
    text = line.rstrip()
    if not text:
        return
    with _lock:
        _state.log_lines.append(text)
        if len(_state.log_lines) > UPDATE_LOG_TAIL:
            _state.log_lines = _state.log_lines[-UPDATE_LOG_TAIL:]


def _set(**kwargs) -> None:
    with _lock:
        for key, value in kwargs.items():
            setattr(_state, key, value)


def snapshot() -> dict:
    with _lock:
        current_sha = _state.current_sha
    if not current_sha:
        current_sha = _read_installed_sha()
        with _lock:
            if not _state.current_sha:
                _state.current_sha = current_sha
    with _lock:
        return {
            "status": _state.status,
            "message": _state.message,
            "error": _state.error,
            "current_version": _state.current_version,
            "current_sha": _state.current_sha,
            "latest_sha": _state.latest_sha,
            "update_available": _state.update_available,
            "can_update": _state.can_update,
            "log": "\n".join(_state.log_lines),
            "github_repo": GITHUB_REPO,
            "branch": DEFAULT_BRANCH,
        }


def _user_env() -> dict[str, str]:
    env = os.environ.copy()
    extras = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/Library/Frameworks/Python.framework/Versions/3.12/bin",
        str(Path.home() / ".local" / "bin"),
    ]
    path_parts = extras + [p for p in env.get("PATH", "").split(":") if p]
    # Preserve order, drop empties/dupes
    seen: set[str] = set()
    ordered: list[str] = []
    for part in path_parts:
        if part and part not in seen:
            seen.add(part)
            ordered.append(part)
    env["PATH"] = ":".join(ordered)
    env["HOME"] = str(Path.home())
    env["INSTALL"] = "0"  # never overwrite running app mid-build
    return env


def _run(
    args: list[str],
    *,
    cwd: Path | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    _append_log(f"$ {' '.join(args)}")
    proc = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        env=_user_env(),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.stdout:
        for line in proc.stdout.splitlines():
            _append_log(line)
    if proc.stderr:
        for line in proc.stderr.splitlines():
            _append_log(line)
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"Command failed ({proc.returncode}): {' '.join(args)}"
        )
    return proc


def _run_streaming(args: list[str], *, cwd: Path) -> None:
    _append_log(f"$ {' '.join(args)}")
    proc = subprocess.Popen(
        args,
        cwd=str(cwd),
        env=_user_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        _append_log(line)
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {' '.join(args)}")


def _which(name: str) -> str | None:
    return shutil.which(name, path=_user_env()["PATH"])


def _read_installed_sha() -> str | None:
    if not INSTALLED_REVISION_FILE.is_file():
        return None
    value = INSTALLED_REVISION_FILE.read_text(encoding="utf-8").strip()
    return value or None


def _write_installed_sha(sha: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    INSTALLED_REVISION_FILE.write_text(sha + "\n", encoding="utf-8")


def _remote_head_sha() -> str:
    git = _which("git")
    if not git:
        raise RuntimeError("git is not installed or not on PATH")
    proc = _run(
        [git, "ls-remote", GITHUB_CLONE_URL, f"refs/heads/{DEFAULT_BRANCH}"],
        check=True,
    )
    line = (proc.stdout or "").strip().splitlines()
    if not line:
        raise RuntimeError("Could not resolve latest commit from GitHub")
    sha = line[0].split()[0].strip()
    if len(sha) < 7:
        raise RuntimeError("Unexpected GitHub ls-remote response")
    return sha


def _ensure_tools() -> None:
    missing = [name for name in ("git", "npm", "python3") if not _which(name)]
    if missing:
        raise RuntimeError(
            "Missing tools required to update: "
            + ", ".join(missing)
            + ". Install them (e.g. Xcode CLT, Node, Python) and try again."
        )


def _ensure_managed_source() -> Path:
    git = _which("git")
    assert git
    MANAGED_SRC.parent.mkdir(parents=True, exist_ok=True)
    if (MANAGED_SRC / ".git").is_dir() and (MANAGED_SRC / "desktop" / "build.sh").is_file():
        _run([git, "remote", "set-url", "origin", GITHUB_CLONE_URL], cwd=MANAGED_SRC)
        _run([git, "fetch", "--prune", "origin"], cwd=MANAGED_SRC)
        _run(
            [git, "checkout", "-B", DEFAULT_BRANCH, f"origin/{DEFAULT_BRANCH}"],
            cwd=MANAGED_SRC,
        )
        _run([git, "reset", "--hard", f"origin/{DEFAULT_BRANCH}"], cwd=MANAGED_SRC)
        _run([git, "clean", "-fd"], cwd=MANAGED_SRC)
        return MANAGED_SRC

    if MANAGED_SRC.exists():
        shutil.rmtree(MANAGED_SRC)

    _append_log(f"Cloning {GITHUB_CLONE_URL}…")
    _run(
        [
            git,
            "clone",
            "--branch",
            DEFAULT_BRANCH,
            "--single-branch",
            GITHUB_CLONE_URL,
            str(MANAGED_SRC),
        ],
        check=True,
    )
    return MANAGED_SRC


def _local_project_root() -> Path | None:
    env = os.environ.get("F1NANCER_SOURCE_DIR", "").strip()
    if env:
        root = Path(env).expanduser().resolve()
        if (root / "desktop" / "build.sh").is_file():
            return root
    if getattr(sys, "frozen", False):
        return None
    # backend/app/update_service.py → repo root
    root = Path(__file__).resolve().parents[2]
    if (root / "desktop" / "build.sh").is_file():
        return root
    return None


def _sync_developer_tree(root: Path) -> None:
    """Best-effort pull for a working tree; never hard-reset local changes."""
    git = _which("git")
    if not git or not (root / ".git").is_dir():
        _append_log("No git metadata; rebuilding current source as-is.")
        return
    dirty = _run([git, "status", "--porcelain"], cwd=root, check=False)
    if (dirty.stdout or "").strip():
        _append_log("Local changes detected; rebuilding current tree without pull.")
        return
    _run([git, "fetch", "--prune", "origin"], cwd=root, check=False)
    pull = _run(
        [git, "pull", "--ff-only", "origin", DEFAULT_BRANCH],
        cwd=root,
        check=False,
    )
    if pull.returncode != 0:
        _append_log("Fast-forward pull failed; rebuilding current tree as-is.")


def _prepare_source() -> Path:
    local = _local_project_root()
    if local is not None:
        _append_log(f"Using local source: {local}")
        _sync_developer_tree(local)
        return local
    _append_log("No local source tree; using managed GitHub checkout.")
    return _ensure_managed_source()


def _local_head_sha(root: Path) -> str:
    git = _which("git")
    if not git or not (root / ".git").is_dir():
        return "unknown"
    proc = _run([git, "rev-parse", "HEAD"], cwd=root, check=True)
    return (proc.stdout or "").strip()


def check_for_updates() -> dict:
    with _lock:
        if _state.status == "updating":
            return snapshot()
        _state.status = "checking"
        _state.message = "Checking GitHub for the latest version…"
        _state.error = None
        _state.log_lines = []

    try:
        _ensure_tools()
        latest = _remote_head_sha()
        current = _read_installed_sha()
        local = _local_project_root()
        if local is not None and (local / ".git").is_dir():
            try:
                current = _local_head_sha(local) or current
            except Exception:  # noqa: BLE001
                pass
        available = current is None or current != latest
        _set(
            status="available" if available else "up_to_date",
            message=(
                "A newer version is available on GitHub."
                if available
                else "You are on the latest version."
            ),
            current_sha=current,
            latest_sha=latest,
            update_available=available,
            can_update=True,
            error=None,
        )
    except Exception as exc:  # noqa: BLE001 — surface to UI
        _set(
            status="failed",
            message="Could not check for updates.",
            error=str(exc),
            update_available=False,
            can_update=True,
        )
    return snapshot()


def _update_worker() -> None:
    try:
        _set(
            status="updating",
            message="Downloading and building the latest version…",
            error=None,
            started_at=time.time(),
            finished_at=None,
            log_lines=[],
        )
        _ensure_tools()
        root = _prepare_source()
        sha = _local_head_sha(root)
        _set(latest_sha=sha, current_sha=_read_installed_sha())

        build_sh = root / "desktop" / "build.sh"
        if not build_sh.is_file():
            raise RuntimeError("desktop/build.sh missing from checkout")

        # Login shell so GUI-launched apps pick up Homebrew / pyenv PATH.
        _run_streaming(
            ["/bin/zsh", "-lc", f'cd "{root}" && INSTALL=0 ./desktop/build.sh'],
            cwd=root,
        )

        app_path = root / "desktop" / "dist" / "F1nancer.app"
        if not app_path.is_dir():
            raise RuntimeError(f"Build finished but {app_path} is missing")

        _write_installed_sha(sha)
        _set(
            status="ready",
            message="Update ready. Restart to install and open the new version.",
            update_available=False,
            current_sha=sha,
            latest_sha=sha,
            finished_at=time.time(),
            error=None,
        )
    except Exception as exc:  # noqa: BLE001
        _set(
            status="failed",
            message="Update failed.",
            error=str(exc),
            finished_at=time.time(),
        )
    finally:
        global _worker
        _worker = None


def start_update() -> dict:
    global _worker
    with _lock:
        if _state.status == "updating":
            return snapshot()
        if _worker and _worker.is_alive():
            return snapshot()

    try:
        _ensure_tools()
    except Exception as exc:  # noqa: BLE001
        _set(
            status="failed",
            message="Update failed.",
            error=str(exc),
            update_available=False,
        )
        return snapshot()

    worker = threading.Thread(target=_update_worker, name="f1nancer-update", daemon=True)
    _worker = worker
    worker.start()
    return snapshot()


def _built_app_path() -> Path:
    local = _local_project_root()
    candidates = []
    if local is not None:
        candidates.append(local / "desktop" / "dist" / "F1nancer.app")
    candidates.append(MANAGED_SRC / "desktop" / "dist" / "F1nancer.app")
    for path in candidates:
        if path.is_dir():
            return path
    raise RuntimeError("Built F1nancer.app not found. Run Update first.")


def _apply_update_script() -> Path:
    """Prefer script from the tree we just built; fall back to bundled copy."""
    local = _local_project_root()
    candidates: list[Path] = []
    if local is not None:
        candidates.append(local / "desktop" / "apply_update.sh")
    candidates.append(MANAGED_SRC / "desktop" / "apply_update.sh")
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS"))
        candidates.append(meipass / "desktop" / "apply_update.sh")
    candidates.append(Path(__file__).resolve().parents[2] / "desktop" / "apply_update.sh")
    for path in candidates:
        if path.is_file():
            return path
    raise RuntimeError("apply_update.sh not found")


def relaunch_updated_app() -> dict:
    with _lock:
        if _state.status != "ready":
            raise RuntimeError("No update is ready to install. Run Update first.")

    app_src = _built_app_path()
    script = _apply_update_script()
    # Copy helper into data dir so it survives quitting a frozen bundle.
    helper = DATA_DIR / "apply_update.sh"
    shutil.copy2(script, helper)
    helper.chmod(helper.stat().st_mode | 0o111)

    pid = os.getpid()
    _set(status="relaunching", message="Installing and relaunching…")
    subprocess.Popen(
        ["/bin/bash", str(helper), str(app_src), str(pid)],
        start_new_session=True,
        env=_user_env(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    def _exit_soon() -> None:
        time.sleep(0.6)
        os._exit(0)

    threading.Thread(target=_exit_soon, name="f1nancer-exit", daemon=True).start()
    return snapshot()
