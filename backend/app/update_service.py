"""In-app update: download a GitHub Release and install/relaunch the desktop app."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path

from app.database import DATA_DIR
from app.version import APP_VERSION, DEFAULT_BRANCH, GITHUB_REPO

INSTALLED_REVISION_FILE = DATA_DIR / "installed_revision.txt"
STATE_FILE = DATA_DIR / "update_state.json"
UPDATES_DIR = DATA_DIR / "updates"
UPDATE_LOG_TAIL = 120
IS_WINDOWS = sys.platform == "win32"
IS_DARWIN = sys.platform == "darwin"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_TIMEOUT = 30
DOWNLOAD_TIMEOUT = 120


@dataclass
class UpdateState:
    status: str = "idle"
    # idle | checking | up_to_date | available | updating | ready | failed | relaunching
    message: str = ""
    error: str | None = None
    current_version: str = APP_VERSION
    latest_version: str | None = None
    current_sha: str | None = None
    latest_sha: str | None = None
    update_available: bool = False
    can_update: bool = True
    mode: str = "desktop"
    source: str | None = None
    package_path: str | None = None
    progress: int = 0
    phase: str = ""
    log_lines: list[str] = field(default_factory=list)
    started_at: float | None = None
    finished_at: float | None = None


_lock = threading.Lock()
_state = UpdateState()
_worker: threading.Thread | None = None


def _is_packaged() -> bool:
    return bool(getattr(sys, "frozen", False))


def _append_log(line: str) -> None:
    text = line.rstrip()
    if not text:
        return
    should_persist = False
    with _lock:
        _state.log_lines.append(text)
        if len(_state.log_lines) > UPDATE_LOG_TAIL:
            _state.log_lines = _state.log_lines[-UPDATE_LOG_TAIL:]
        should_persist = len(_state.log_lines) % 8 == 0
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
            "latest_version",
            "current_sha",
            "latest_sha",
            "update_available",
            "can_update",
            "mode",
            "source",
            "package_path",
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
    """Copy the running app's revision stamp into DATA_DIR."""
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS"))
        candidates.append(meipass / "installed_revision.txt")
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
            "latest_version": _state.latest_version,
            "current_sha": _state.current_sha,
            "latest_sha": _state.latest_sha,
            "update_available": _state.update_available,
            "can_update": _state.can_update,
            "mode": "desktop",
            "source": _state.source,
            "package_path": _state.package_path,
            "progress": _state.progress,
            "phase": _state.phase,
            "log": "\n".join(_state.log_lines),
            "github_repo": GITHUB_REPO,
            "branch": DEFAULT_BRANCH,
        }


def _spawn_env() -> dict[str, str]:
    env = os.environ.copy()
    env["HOME"] = str(Path.home())
    return env


def _github_headers() -> dict[str, str]:
    return {
        "User-Agent": f"F1nancer/{APP_VERSION}",
        "Accept": "application/vnd.github+json",
    }


def _parse_version(value: str) -> tuple[int, ...]:
    text = value.strip()
    if text.lower().startswith("v"):
        text = text[1:]
    parts: list[int] = []
    for token in text.split("."):
        digits = ""
        for char in token:
            if char.isdigit():
                digits += char
            else:
                break
        parts.append(int(digits) if digits else 0)
    return tuple(parts) if parts else (0,)


def _normalize_tag(tag: str) -> str:
    text = tag.strip()
    if text.lower().startswith("v"):
        text = text[1:]
    return text or tag.strip()


def _sha_from_commitish(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    if len(text) >= 7 and all(char in "0123456789abcdefABCDEF" for char in text):
        return text.lower()
    return None


def _http_error_message(exc: urllib.error.HTTPError) -> str:
    if exc.code == 404:
        return "No GitHub releases found."
    if exc.code == 403:
        return "GitHub rate-limited this computer. Try again later."
    return f"GitHub request failed ({exc.code})."


def _github_latest_release() -> dict:
    request = urllib.request.Request(GITHUB_API, headers=_github_headers())
    try:
        with urllib.request.urlopen(request, timeout=GITHUB_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(_http_error_message(exc)) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"Could not reach GitHub: {reason}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("GitHub returned an unexpected response.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("GitHub returned an unexpected response.")
    return payload


def _platform_asset(release: dict) -> dict:
    assets = release.get("assets") or []
    names = [str(asset.get("name") or "") for asset in assets if isinstance(asset, dict)]
    if IS_WINDOWS:
        matches = [
            asset
            for asset in assets
            if isinstance(asset, dict)
            and str(asset.get("name") or "").lower().endswith("-setup.exe")
        ]
        kind = "Windows installer (.exe)"
    elif IS_DARWIN:
        matches = [
            asset
            for asset in assets
            if isinstance(asset, dict)
            and str(asset.get("name") or "").lower().endswith(".dmg")
        ]
        kind = "Mac disk image (.dmg)"
    else:
        raise RuntimeError("In-app updates are only available on Mac and Windows.")
    if not matches:
        listed = ", ".join(name for name in names if name) or "none"
        raise RuntimeError(f"This GitHub release has no {kind}. Assets: {listed}")
    return matches[0]


def _source_checkout_message() -> str:
    if IS_WINDOWS:
        return (
            "You're running from source. Build the desktop app with "
            "desktop\\build.ps1 to install updates from Settings."
        )
    return (
        "You're running from source. Build the desktop app with "
        "./desktop/build.sh to install updates from Settings."
    )


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

    try:
        release = _github_latest_release()
        tag = str(release.get("tag_name") or "").strip()
        if not tag:
            raise RuntimeError("GitHub release is missing a version tag.")
        latest_version = _normalize_tag(tag)
        latest_sha = _sha_from_commitish(str(release.get("target_commitish") or "") or None)
        current = _read_installed_sha()
        available = _parse_version(latest_version) > _parse_version(APP_VERSION)
        packaged = _is_packaged()
        if packaged:
            _platform_asset(release)
        if available:
            message = f"Version {latest_version} is available."
            if not packaged:
                message += " " + _source_checkout_message()
        else:
            message = "You're up to date."
        _set(
            status="available" if available else "up_to_date",
            message=message,
            current_sha=current,
            latest_sha=latest_sha,
            latest_version=latest_version,
            update_available=available,
            can_update=packaged,
            error=None,
            progress=100 if not available else 0,
            phase="Up to date" if not available else "Update available",
            source=f"https://github.com/{GITHUB_REPO}/releases/tag/{tag}",
            log_lines=[],
        )
    except Exception as exc:  # noqa: BLE001
        _set(
            status="failed",
            message="Could not check for updates.",
            error=str(exc),
            update_available=False,
            can_update=_is_packaged(),
            progress=0,
            phase="Failed",
        )
    return snapshot()


def _download_asset(url: str, dest: Path, expected_size: int | None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".partial")
    if tmp.exists():
        tmp.unlink()
    request = urllib.request.Request(url, headers=_github_headers())
    _append_log(f"Downloading {url}")
    try:
        with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT) as response:
            total = int(response.headers.get("Content-Length") or 0) or (expected_size or 0)
            read = 0
            last_logged = 0
            with tmp.open("wb") as handle:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
                    read += len(chunk)
                    if total:
                        pct = 15 + int((read / total) * 70)
                        _set(
                            progress=min(pct, 88),
                            phase="Downloading",
                            message="Downloading update…",
                        )
                    if read - last_logged >= 2 * 1024 * 1024:
                        mb = read / (1024 * 1024)
                        if total:
                            total_mb = total / (1024 * 1024)
                            _append_log(f"Downloaded {mb:.1f} / {total_mb:.1f} MB")
                        else:
                            _append_log(f"Downloaded {mb:.1f} MB")
                        last_logged = read
    except urllib.error.HTTPError as exc:
        raise RuntimeError(_http_error_message(exc)) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"Could not download update: {reason}") from exc
    tmp.replace(dest)
    _append_log(f"Saved {dest}")


def _clear_updates_dir(*, keep: Path | None = None) -> None:
    if not UPDATES_DIR.is_dir():
        return
    for item in UPDATES_DIR.iterdir():
        if keep is not None and item.resolve() == keep.resolve():
            continue
        try:
            if item.is_file() or item.is_symlink():
                item.unlink()
            elif item.is_dir():
                shutil.rmtree(item)
        except OSError:
            pass


def _downloaded_package() -> Path:
    with _lock:
        path = _state.package_path
    if path:
        candidate = Path(path)
        if candidate.is_file():
            return candidate
    raise RuntimeError("No update is ready to install. Run Update first.")


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
        if not _is_packaged():
            raise RuntimeError(_source_checkout_message())

        _append_log(f"Checking GitHub releases for {GITHUB_REPO}")
        release = _github_latest_release()
        tag = str(release.get("tag_name") or "").strip()
        latest_version = _normalize_tag(tag) if tag else None
        latest_sha = _sha_from_commitish(str(release.get("target_commitish") or "") or None)
        asset = _platform_asset(release)
        name = str(asset.get("name") or "update.bin")
        url = str(asset.get("browser_download_url") or "")
        size = asset.get("size")
        expected_size = int(size) if isinstance(size, int) else None
        if not url:
            raise RuntimeError("GitHub release asset is missing a download URL.")

        _set(
            latest_version=latest_version,
            latest_sha=latest_sha,
            current_sha=_read_installed_sha(),
            source=url,
            phase="Downloading",
            progress=12,
            message=f"Downloading {name}…",
        )
        dest = UPDATES_DIR / name
        _clear_updates_dir()
        _download_asset(url, dest, expected_size)

        _set(
            status="ready",
            message=(
                "Update ready — restarting to finish install…"
                if auto_relaunch
                else "Update ready. Restart to install the new app."
            ),
            update_available=False,
            current_sha=_read_installed_sha(),
            latest_sha=latest_sha,
            latest_version=latest_version,
            package_path=str(dest),
            finished_at=time.time(),
            error=None,
            progress=100,
            phase="Ready",
        )
        _append_log("Update ready")

        if auto_relaunch:
            time.sleep(1.2)
            try:
                relaunch_updated_app()
            except Exception as exc:  # noqa: BLE001
                _set(
                    status="ready",
                    message="Update downloaded, but automatic restart failed. Click Install & restart.",
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
        _append_log(str(exc))
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

    if not _is_packaged():
        _set(
            status="failed",
            message="Update failed.",
            error=_source_checkout_message(),
            update_available=False,
            can_update=False,
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
            preferred = _default_windows_install_dir()
            try:
                if running.resolve() == preferred.resolve():
                    return preferred
                if preferred in running.parents or running == preferred:
                    return preferred
            except OSError:
                pass
            return preferred
    return _default_windows_install_dir()


def _mac_install_dir() -> Path:
    if getattr(sys, "frozen", False):
        exe = Path(sys.executable).resolve()
        # F1nancer.app/Contents/MacOS/F1nancer
        if exe.parent.name == "MacOS" and exe.parent.parent.name == "Contents":
            return exe.parent.parent.parent
    return Path.home() / "Applications" / "F1nancer.app"


def _apply_update_script_name() -> str:
    return "apply_update.ps1" if IS_WINDOWS else "apply_update.sh"


def _apply_update_script() -> Path:
    name = _apply_update_script_name()
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS"))
        candidates.append(meipass / "desktop" / name)
        candidates.append(Path(sys.executable).resolve().parent / "desktop" / name)
    candidates.append(Path(__file__).resolve().parents[2] / "desktop" / name)
    candidates.append(DATA_DIR / name)
    for path in candidates:
        if path.is_file():
            return path
    raise RuntimeError(f"{name} not found")


def relaunch_updated_app() -> dict:
    with _lock:
        ready = _state.status in ("ready", "relaunching")
    try:
        package = _downloaded_package()
    except RuntimeError as exc:
        if not ready:
            raise RuntimeError("No update is ready to install. Run Update first.") from exc
        raise

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
            log.write(f"\n--- relaunch pid={pid} pkg={package} dest={dest} ---\n")
            subprocess.Popen(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(helper),
                    str(package),
                    str(pid),
                    str(dest),
                ],
                creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                | getattr(subprocess, "DETACHED_PROCESS", 0),
                env=_spawn_env(),
                stdout=log,
                stderr=log,
                close_fds=True,
            )
        else:
            dest = _mac_install_dir()
            log.write(f"\n--- relaunch pid={pid} pkg={package} dest={dest} ---\n")
            subprocess.Popen(
                ["/bin/bash", str(helper), str(package), str(pid), str(dest)],
                start_new_session=True,
                env=_spawn_env(),
                stdout=log,
                stderr=log,
            )

    def _exit_soon() -> None:
        time.sleep(0.8)
        os._exit(0)

    threading.Thread(target=_exit_soon, name="f1nancer-exit", daemon=True).start()
    return snapshot()
