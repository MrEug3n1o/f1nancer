"""In-app update: sync source, rebuild, and install/relaunch the desktop app."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass, field
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
STATE_FILE = DATA_DIR / "update_state.json"
UPDATE_LOG_TAIL = 120
IS_WINDOWS = sys.platform == "win32"
IS_DARWIN = sys.platform == "darwin"
PATH_SEP = ";" if IS_WINDOWS else ":"

# Progress milestones matched against build log lines (best-effort).
_PROGRESS_MARKERS: list[tuple[str, int, str]] = [
    ("using local source", 8, "Preparing source"),
    ("using managed", 8, "Preparing source"),
    ("cloning", 12, "Downloading source"),
    ("local changes detected", 15, "Preparing source"),
    ("installing frontend", 25, "Installing frontend deps"),
    ("building frontend", 40, "Building frontend"),
    ("using python", 50, "Preparing Python"),
    ("packaging", 65, "Packaging app"),
    ("done:", 90, "Finishing build"),
    ("update ready", 100, "Ready"),
]


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
    mode: str = "desktop"
    source: str | None = None
    progress: int = 0
    phase: str = ""
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
    lower = text.lower()
    progress = None
    phase = None
    for marker, pct, label in _PROGRESS_MARKERS:
        if marker in lower:
            progress = pct
            phase = label
    should_persist = False
    with _lock:
        _state.log_lines.append(text)
        if len(_state.log_lines) > UPDATE_LOG_TAIL:
            _state.log_lines = _state.log_lines[-UPDATE_LOG_TAIL:]
        if progress is not None and progress >= _state.progress:
            _state.progress = progress
            if phase:
                _state.phase = phase
            should_persist = True
        elif len(_state.log_lines) % 8 == 0:
            should_persist = True
    if should_persist:
        _persist()


def _set(**kwargs) -> None:
    with _lock:
        for key, value in kwargs.items():
            setattr(_state, key, value)
    _persist()


def _persist() -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with _lock:
            payload = asdict(_state)
        STATE_FILE.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass


def _restore() -> None:
    if not STATE_FILE.is_file():
        return
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    with _lock:
        # Never resume a half-dead in-memory "updating" after process restart.
        status = data.get("status") or "idle"
        if status == "updating":
            status = "failed"
            data["message"] = "Update was interrupted. Try again."
            data["error"] = data.get("error") or "Process restarted during update."
            data["progress"] = 0
        if status == "relaunching":
            status = "ready"
            data["message"] = "Update is ready to install."
        for key in (
            "message",
            "error",
            "current_sha",
            "latest_sha",
            "update_available",
            "can_update",
            "mode",
            "source",
            "progress",
            "phase",
            "log_lines",
            "started_at",
            "finished_at",
        ):
            if key in data:
                setattr(_state, key, data[key])
        _state.status = status
        _state.current_version = APP_VERSION


def _read_installed_sha() -> str | None:
    if not INSTALLED_REVISION_FILE.is_file():
        return None
    value = INSTALLED_REVISION_FILE.read_text(encoding="utf-8").strip()
    return value or None


def _write_installed_sha(sha: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    INSTALLED_REVISION_FILE.write_text(sha + "\n", encoding="utf-8")


def seed_installed_revision_from_bundle() -> None:
    """Copy bundled revision stamp into DATA_DIR on first launch."""
    if INSTALLED_REVISION_FILE.is_file():
        return
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS"))
        candidates.append(meipass / "installed_revision.txt")
        # Onedir layout: next to the executable.
        candidates.append(Path(sys.executable).resolve().parent / "installed_revision.txt")
    for path in candidates:
        if not path.is_file():
            continue
        value = path.read_text(encoding="utf-8").strip()
        if value:
            _write_installed_sha(value)
            return


_restore()
try:
    seed_installed_revision_from_bundle()
except Exception:
    # Stamp copy is best-effort; never block the desktop app from starting.
    pass


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
            "mode": "desktop",
            "source": _state.source,
            "progress": _state.progress,
            "phase": _state.phase,
            "log": "\n".join(_state.log_lines),
            "github_repo": GITHUB_REPO,
            "branch": DEFAULT_BRANCH,
        }


def _user_env() -> dict[str, str]:
    env = os.environ.copy()
    if IS_WINDOWS:
        extras = [
            str(Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Git" / "cmd"),
            str(Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "nodejs"),
            str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Python" / "Python312"),
            str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Python" / "Python312" / "Scripts"),
            str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Python" / "Python311"),
            str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Python" / "Python311" / "Scripts"),
            str(Path.home() / "AppData" / "Roaming" / "npm"),
        ]
        existing = [p for p in env.get("PATH", "").split(";") if p]
    else:
        extras = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/Library/Frameworks/Python.framework/Versions/Current/bin",
            "/Library/Frameworks/Python.framework/Versions/3.12/bin",
            "/Library/Frameworks/Python.framework/Versions/3.11/bin",
            str(Path.home() / ".local" / "bin"),
        ]
        existing = [p for p in env.get("PATH", "").split(":") if p]

    path_parts = extras + existing
    seen: set[str] = set()
    ordered: list[str] = []
    for part in path_parts:
        if part and part not in seen:
            seen.add(part)
            ordered.append(part)
    env["PATH"] = PATH_SEP.join(ordered)
    env["HOME"] = str(Path.home())
    env["INSTALL"] = "0"
    env["MAKE_ZIP"] = "0"
    env["MAKE_DMG"] = "0"
    # Avoid nested interactive prompts / colored noise.
    env["CI"] = "1"
    env["NPM_CONFIG_FUND"] = "false"
    env["NPM_CONFIG_AUDIT"] = "false"
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
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        _append_log(line)
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {' '.join(args)}")


def _which(name: str) -> str | None:
    return shutil.which(name, path=_user_env()["PATH"])


def _python_cmd() -> str | None:
    for name in ("python3", "python", "py"):
        found = _which(name)
        if found:
            return found
    return None


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


def _tools_hint() -> str:
    if IS_WINDOWS:
        return "Install Git for Windows, Node.js, and Python, then try again."
    return "Install Xcode Command Line Tools, Node.js, and Python, then try again."


def _ensure_tools(*, need_npm: bool = True) -> None:
    missing: list[str] = []
    if not _which("git"):
        missing.append("git")
    if not _python_cmd():
        missing.append("python")
    if need_npm and not _which("npm"):
        missing.append("npm")
    if missing:
        raise RuntimeError(
            "Missing tools required to update: "
            + ", ".join(missing)
            + ". "
            + _tools_hint()
        )


def _has_desktop_build(root: Path) -> bool:
    desktop = root / "desktop"
    if IS_WINDOWS:
        return (desktop / "build.ps1").is_file()
    return (desktop / "build.sh").is_file()


def _ensure_managed_source() -> Path:
    git = _which("git")
    assert git
    MANAGED_SRC.parent.mkdir(parents=True, exist_ok=True)
    if (MANAGED_SRC / ".git").is_dir() and _has_desktop_build(MANAGED_SRC):
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


def _looks_like_project(root: Path) -> bool:
    has_build = (root / "desktop" / "build.sh").is_file() or (
        root / "desktop" / "build.ps1"
    ).is_file()
    return has_build and (
        (root / "backend" / "app").is_dir() or (root / "frontend").is_dir()
    )


def _local_project_root() -> Path | None:
    env = os.environ.get("F1NANCER_SOURCE_DIR", "").strip()
    if env:
        root = Path(env).expanduser().resolve()
        if _looks_like_project(root):
            return root

    if not getattr(sys, "frozen", False):
        root = Path(__file__).resolve().parents[2]
        if _looks_like_project(root):
            return root

    # Packaged app: still prefer a nearby developer checkout when present.
    for candidate in (
        Path.home() / "PycharmProjects" / "f1nancer",
        Path.home() / "Projects" / "f1nancer",
        Path.home() / "Developer" / "f1nancer",
        Path.home() / "src" / "f1nancer",
        Path.home() / "source" / "f1nancer",
    ):
        if _looks_like_project(candidate):
            return candidate.resolve()
    return None


def _sync_developer_tree(root: Path) -> None:
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
        _set(source=str(local))
        return local
    _append_log("No local source tree; using managed GitHub checkout.")
    root = _ensure_managed_source()
    _set(source=str(root))
    return root


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
        _state.message = "Checking for updates…"
        _state.error = None
        _state.phase = "Checking"
        _state.progress = 5
        _state.mode = "desktop"
        # Keep prior build logs; don't spam check output into the UI log.

    try:
        _ensure_tools(need_npm=False)
        latest = _remote_head_sha_quiet()
        current = _read_installed_sha()
        local = _local_project_root()
        if local is not None and (local / ".git").is_dir():
            try:
                current = _local_head_sha_quiet(local) or current
            except Exception:  # noqa: BLE001
                pass
        available = current is None or current != latest
        _set(
            status="available" if available else "up_to_date",
            message=(
                "A newer version is available."
                if available
                else "You're up to date."
            ),
            current_sha=current,
            latest_sha=latest,
            update_available=available,
            can_update=True,
            error=None,
            progress=100 if not available else 0,
            phase="Up to date" if not available else "Update available",
            source=str(local) if local else None,
            log_lines=[],
        )
    except Exception as exc:  # noqa: BLE001
        _set(
            status="failed",
            message="Could not check for updates.",
            error=str(exc),
            update_available=False,
            can_update=True,
            progress=0,
            phase="Failed",
        )
    return snapshot()


def _remote_head_sha_quiet() -> str:
    git = _which("git")
    if not git:
        raise RuntimeError("git is not installed or not on PATH")
    proc = subprocess.run(
        [git, "ls-remote", GITHUB_CLONE_URL, f"refs/heads/{DEFAULT_BRANCH}"],
        env=_user_env(),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "git ls-remote failed").strip())
    line = (proc.stdout or "").strip().splitlines()
    if not line:
        raise RuntimeError("Could not resolve latest commit from GitHub")
    sha = line[0].split()[0].strip()
    if len(sha) < 7:
        raise RuntimeError("Unexpected GitHub ls-remote response")
    return sha


def _local_head_sha_quiet(root: Path) -> str:
    git = _which("git")
    if not git or not (root / ".git").is_dir():
        return "unknown"
    proc = subprocess.run(
        [git, "rev-parse", "HEAD"],
        cwd=str(root),
        env=_user_env(),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "git rev-parse failed").strip())
    return (proc.stdout or "").strip()


def _build_desktop(root: Path) -> Path:
    if IS_WINDOWS:
        build_ps1 = root / "desktop" / "build.ps1"
        if not build_ps1.is_file():
            raise RuntimeError("desktop/build.ps1 missing from checkout")
        _set(phase="Building Windows app", progress=20)
        _run_streaming(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(build_ps1),
            ],
            cwd=root,
        )
        app_path = root / "desktop" / "dist" / "F1nancer"
        exe = app_path / "F1nancer.exe"
        if not exe.is_file():
            raise RuntimeError(f"Build finished but {exe} is missing")
        return app_path

    build_sh = root / "desktop" / "build.sh"
    if not build_sh.is_file():
        raise RuntimeError("desktop/build.sh missing from checkout")
    _set(phase="Building Mac app", progress=20)
    shell = "/bin/zsh" if Path("/bin/zsh").is_file() else "/bin/bash"
    _run_streaming(
        [shell, "-lc", f'cd "{root}" && INSTALL=0 MAKE_DMG=0 ./desktop/build.sh'],
        cwd=root,
    )
    app_path = root / "desktop" / "dist" / "F1nancer.app"
    if not app_path.is_dir():
        raise RuntimeError(f"Build finished but {app_path} is missing")
    return app_path


def _update_worker(*, auto_relaunch: bool) -> None:
    try:
        _set(
            status="updating",
            message="Updating F1nancer…",
            error=None,
            started_at=time.time(),
            finished_at=None,
            log_lines=[],
            progress=5,
            phase="Starting",
            mode="desktop",
        )
        _ensure_tools(need_npm=True)
        root = _prepare_source()
        sha = _local_head_sha(root)
        _set(latest_sha=sha, current_sha=_read_installed_sha())

        _build_desktop(root)

        _write_installed_sha(sha)
        _set(
            status="ready",
            message=(
                "Update ready — restarting to finish install…"
                if auto_relaunch
                else "Update ready. Restart to install the new app."
            ),
            update_available=False,
            current_sha=sha,
            latest_sha=sha,
            finished_at=time.time(),
            error=None,
            progress=100,
            phase="Ready",
        )

        if auto_relaunch:
            time.sleep(1.2)
            try:
                relaunch_updated_app()
            except Exception as exc:  # noqa: BLE001
                _set(
                    status="ready",
                    message="Update built, but automatic restart failed. Click Install & restart.",
                    error=str(exc),
                    phase="Ready",
                )
    except Exception as exc:  # noqa: BLE001
        _set(
            status="failed",
            message="Update failed.",
            error=str(exc),
            finished_at=time.time(),
            progress=0,
            phase="Failed",
        )
    finally:
        global _worker
        _worker = None


def start_update(*, auto_relaunch: bool = True) -> dict:
    global _worker
    with _lock:
        if _state.status == "updating":
            return snapshot()
        if _worker and _worker.is_alive():
            return snapshot()

    try:
        _ensure_tools(need_npm=True)
    except Exception as exc:  # noqa: BLE001
        _set(
            status="failed",
            message="Update failed.",
            error=str(exc),
            update_available=False,
            phase="Failed",
        )
        return snapshot()

    worker = threading.Thread(
        target=_update_worker,
        kwargs={"auto_relaunch": auto_relaunch},
        name="f1nancer-update",
        daemon=True,
    )
    _worker = worker
    worker.start()
    return snapshot()


def _default_windows_install_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / "Programs" / "F1nancer"


def _windows_install_dir() -> Path:
    if getattr(sys, "frozen", False):
        running = Path(sys.executable).resolve().parent
        if (running / "F1nancer.exe").is_file() or running.name == "F1nancer":
            # Prefer Programs\F1nancer once installed; stay put if already there.
            preferred = _default_windows_install_dir()
            try:
                if running.resolve() == preferred.resolve():
                    return preferred
                if preferred in running.parents or running == preferred:
                    return preferred
            except OSError:
                pass
            # Running from a zip extract: install to stable Programs location.
            return preferred
    return _default_windows_install_dir()


def _built_app_path() -> Path:
    local = _local_project_root()
    candidates: list[Path] = []
    if IS_WINDOWS:
        if local is not None:
            candidates.append(local / "desktop" / "dist" / "F1nancer")
        candidates.append(MANAGED_SRC / "desktop" / "dist" / "F1nancer")
        existing = [p for p in candidates if (p / "F1nancer.exe").is_file()]
        if not existing:
            raise RuntimeError("Built F1nancer.exe not found. Run Update first.")
        return max(existing, key=lambda p: p.stat().st_mtime)

    if local is not None:
        candidates.append(local / "desktop" / "dist" / "F1nancer.app")
    candidates.append(MANAGED_SRC / "desktop" / "dist" / "F1nancer.app")
    existing = [p for p in candidates if p.is_dir()]
    if not existing:
        raise RuntimeError("Built F1nancer.app not found. Run Update first.")
    return max(existing, key=lambda p: p.stat().st_mtime)


def _apply_update_script_name() -> str:
    return "apply_update.ps1" if IS_WINDOWS else "apply_update.sh"


def _apply_update_script() -> Path:
    name = _apply_update_script_name()
    local = _local_project_root()
    candidates: list[Path] = []
    if local is not None:
        candidates.append(local / "desktop" / name)
    candidates.append(MANAGED_SRC / "desktop" / name)
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS"))
        candidates.append(meipass / "desktop" / name)
    candidates.append(Path(__file__).resolve().parents[2] / "desktop" / name)
    candidates.append(DATA_DIR / name)
    for path in candidates:
        if path.is_file():
            return path
    raise RuntimeError(f"{name} not found")


def relaunch_updated_app() -> dict:
    with _lock:
        if _state.status not in ("ready", "relaunching"):
            # Allow retry if a built app exists even after a failed auto-relaunch.
            try:
                _built_app_path()
            except RuntimeError as exc:
                raise RuntimeError(
                    "No update is ready to install. Run Update first."
                ) from exc

    app_src = _built_app_path()
    script = _apply_update_script()
    helper_name = _apply_update_script_name()
    helper = DATA_DIR / helper_name
    shutil.copy2(script, helper)
    if not IS_WINDOWS:
        helper.chmod(helper.stat().st_mode | 0o111)

    pid = os.getpid()
    log_file = DATA_DIR / "apply_update.log"
    _set(
        status="relaunching",
        message="Installing and relaunching…",
        phase="Installing",
        progress=100,
    )

    with open(log_file, "a", encoding="utf-8") as log:
        if IS_WINDOWS:
            dest = _windows_install_dir()
            log.write(f"\n--- relaunch pid={pid} app={app_src} dest={dest} ---\n")
            subprocess.Popen(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(helper),
                    str(app_src),
                    str(pid),
                    str(dest),
                ],
                creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                | getattr(subprocess, "DETACHED_PROCESS", 0),
                env=_user_env(),
                stdout=log,
                stderr=log,
                close_fds=True,
            )
        else:
            log.write(f"\n--- relaunch pid={pid} app={app_src} ---\n")
            subprocess.Popen(
                ["/bin/bash", str(helper), str(app_src), str(pid)],
                start_new_session=True,
                env=_user_env(),
                stdout=log,
                stderr=log,
            )

    def _exit_soon() -> None:
        time.sleep(0.8)
        os._exit(0)

    threading.Thread(target=_exit_soon, name="f1nancer-exit", daemon=True).start()
    return snapshot()
