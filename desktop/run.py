"""Launch F1nancer as a native desktop window (macOS / Windows)."""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path


def _default_data_dir() -> Path:
    override = os.environ.get("F1NANCER_DATA_DIR")
    if override:
        return Path(override).expanduser()
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "F1nancer"
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "F1nancer"
    return Path.home() / ".local" / "share" / "F1nancer"


def _log_path() -> Path:
    path = _default_data_dir() / "desktop.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _log(message: str) -> None:
    try:
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with _log_path().open("a", encoding="utf-8") as handle:
            handle.write(f"{stamp} {message}\n")
    except OSError:
        pass


def _show_error(title: str, message: str) -> None:
    _log(f"ERROR {title}: {message}")
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(  # type: ignore[attr-defined]
            None,
            message,
            title,
            0x10,
        )
    except Exception:
        pass


def _fatal(title: str, message: str, exc: BaseException | None = None) -> None:
    if exc is not None:
        detail = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        _log(detail)
        message = f"{message}\n\n{exc}\n\nLog: {_log_path()}"
    else:
        message = f"{message}\n\nLog: {_log_path()}"
    _show_error(title, message)
    raise SystemExit(1)


def _project_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent


def _prepare_environment(root: Path) -> None:
    if getattr(sys, "frozen", False):
        # Bundled layout: <_MEIPASS>/app/... and <_MEIPASS>/frontend/dist/...
        sys.path.insert(0, str(root))
        static_dir = root / "frontend" / "dist"
    else:
        sys.path.insert(0, str(root / "backend"))
        static_dir = root / "frontend" / "dist"

    if not static_dir.is_dir():
        _fatal(
            "F1nancer failed to start",
            f"Frontend build not found at {static_dir}.\n"
            "Run: cd frontend && npm run build",
        )

    os.environ.setdefault("F1NANCER_STATIC_DIR", str(static_dir))
    os.environ.setdefault("F1NANCER_DESKTOP", "1")


# Keep in sync with frontend/src/index.css --bg / --ink.
_TITLE_BAR = {
    "light": {"bg": "#f3efe6", "fg": "#1c2a1f"},
    "dark": {"bg": "#141a16", "fg": "#e8efe9"},
}

DWMWA_USE_IMMERSIVE_DARK_MODE = 20
DWMWA_BORDER_COLOR = 34
DWMWA_CAPTION_COLOR = 35
DWMWA_TEXT_COLOR = 36
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOZORDER = 0x0004
SWP_FRAMECHANGED = 0x0020


def _hex_to_colorref(color: str) -> int:
    value = color.removeprefix("#")
    red = int(value[0:2], 16)
    green = int(value[2:4], 16)
    blue = int(value[4:6], 16)
    return red | (green << 8) | (blue << 16)


def _system_prefers_dark() -> bool:
    if sys.platform != "win32":
        return False
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        ) as key:
            value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
        return int(value) == 0
    except OSError:
        return False


def _handle_to_int(handle: object) -> int:
    if handle is None:
        return 0
    try:
        if hasattr(handle, "ToInt64"):
            return int(handle.ToInt64())
        if hasattr(handle, "ToInt32"):
            return int(handle.ToInt32())
        return int(handle)
    except (TypeError, ValueError, OverflowError):
        return 0


def _native_hwnd(window: object | None) -> int:
    native = getattr(window, "native", None)
    if native is None:
        return 0
    try:
        return _handle_to_int(native.Handle)
    except Exception:  # noqa: BLE001
        return 0


def _find_hwnd_by_title(title: str = "F1nancer") -> int:
    if sys.platform != "win32":
        return 0
    try:
        import ctypes

        return int(ctypes.windll.user32.FindWindowW(None, title) or 0)
    except Exception:  # noqa: BLE001
        return 0


def _resolve_hwnd(window: object | None) -> int:
    return _native_hwnd(window) or _find_hwnd_by_title()


def _apply_windows_title_bar(hwnd: int, theme: str) -> None:
    if sys.platform != "win32":
        return
    if hwnd == 0:
        _log("Windows title bar skipped: hwnd=0")
        return
    colors = _TITLE_BAR["dark" if theme == "dark" else "light"]
    try:
        import ctypes
        from ctypes import wintypes

        dwmapi = ctypes.windll.dwmapi
        dwmapi.DwmSetWindowAttribute.argtypes = [
            wintypes.HWND,
            wintypes.DWORD,
            ctypes.c_void_p,
            wintypes.DWORD,
        ]
        dwmapi.DwmSetWindowAttribute.restype = wintypes.LONG

        def set_attr(attribute: int, value: int) -> int:
            payload = ctypes.c_int(value)
            return int(
                dwmapi.DwmSetWindowAttribute(
                    hwnd,
                    attribute,
                    ctypes.byref(payload),
                    ctypes.sizeof(payload),
                )
            )

        caption = _hex_to_colorref(colors["bg"])
        text = _hex_to_colorref(colors["fg"])
        results = {
            "dark": set_attr(DWMWA_USE_IMMERSIVE_DARK_MODE, 1 if theme == "dark" else 0),
            "caption": set_attr(DWMWA_CAPTION_COLOR, caption),
            "text": set_attr(DWMWA_TEXT_COLOR, text),
            "border": set_attr(DWMWA_BORDER_COLOR, caption),
        }
        ctypes.windll.user32.SetWindowPos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        )
        _log(f"Windows title bar theme={theme} hwnd={hwnd} colors={colors} hr={results}")
    except Exception as exc:  # noqa: BLE001
        _log(f"Could not theme Windows title bar: {exc}")


class _DesktopApi:
    def __init__(self) -> None:
        self._window: object | None = None
        self._hwnd = 0
        self._theme = "light"

    def _attach(self, window: object) -> None:
        self._window = window
        self._hwnd = _resolve_hwnd(window)
        self._paint()

    def _reapply(self) -> None:
        self._hwnd = _resolve_hwnd(self._window) or self._hwnd
        self._paint()

    def _paint(self) -> None:
        form = getattr(self._window, "native", None)

        def apply() -> None:
            hwnd = self._hwnd or _resolve_hwnd(self._window)
            self._hwnd = hwnd
            _apply_windows_title_bar(hwnd, self._theme)

        try:
            if form is not None and bool(getattr(form, "InvokeRequired", False)):
                from System import Action

                form.BeginInvoke(Action(apply))
                return
        except Exception as exc:  # noqa: BLE001
            _log(f"Title bar UI invoke failed, applying inline: {exc}")
        apply()

    def set_title_bar_theme(self, theme: str) -> None:
        self._theme = "dark" if theme == "dark" else "light"
        self._reapply()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_server(
    url: str,
    *,
    thread: threading.Thread,
    errors: list[BaseException],
    timeout: float = 15.0,
) -> None:
    deadline = time.time() + timeout
    health = f"{url}/health"
    while time.time() < deadline:
        if errors:
            raise errors[0]
        if not thread.is_alive():
            raise RuntimeError("Local server thread exited before becoming ready")
        try:
            with urllib.request.urlopen(health, timeout=0.5) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            time.sleep(0.05)
    if errors:
        raise errors[0]
    raise RuntimeError(f"Server did not become ready at {health}")


def main() -> None:
    _log(f"Starting F1nancer frozen={getattr(sys, 'frozen', False)} exe={sys.executable}")
    root = _project_root()
    _prepare_environment(root)

    import uvicorn
    import webview

    try:
        from app.main import app as fastapi_app
    except Exception as exc:  # noqa: BLE001
        _fatal(
            "F1nancer failed to start",
            "Could not load the application backend.",
            exc,
        )

    _log(f"pywebview backend candidates loaded from {webview.__file__}")

    port = _free_port()
    host = "127.0.0.1"
    url = f"http://{host}:{port}"

    config = uvicorn.Config(
        fastapi_app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
        loop="asyncio",
        http="h11",
        ws="none",
        lifespan="on",
    )
    server = uvicorn.Server(config)
    server.install_signal_handlers = False  # type: ignore[method-assign]

    server_error: list[BaseException] = []

    def _run_server() -> None:
        try:
            server.run()
        except BaseException as exc:  # noqa: BLE001
            _log("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
            server_error.append(exc)

    thread = threading.Thread(target=_run_server, daemon=True, name="f1nancer-server")
    thread.start()

    try:
        try:
            _wait_for_server(url, thread=thread, errors=server_error)
        except Exception as exc:  # noqa: BLE001
            _fatal(
                "F1nancer failed to start",
                "The local app server could not start.",
                exc,
            )
        _log(f"Server ready at {url}; opening window")
        initial_theme = "dark" if _system_prefers_dark() else "light"
        api = _DesktopApi()
        api._theme = initial_theme
        window = webview.create_window(
            "F1nancer",
            url,
            width=1280,
            height=840,
            min_size=(900, 600),
            background_color=_TITLE_BAR[initial_theme]["bg"],
            js_api=api,
        )

        def on_before_show(window):
            api._attach(window)

        def on_shown(window):
            api._attach(window)

        def on_maximized(window):
            api._attach(window)

        def on_restored(window):
            api._attach(window)

        def on_ready():
            api._reapply()

        window.events.before_show += on_before_show
        window.events.shown += on_shown
        window.events.maximized += on_maximized
        window.events.restored += on_restored
        webview.start(on_ready)
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        _log("Shutdown complete")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        _fatal(
            "F1nancer failed to start",
            "The app could not start. Common fixes on Windows:\n"
            "1) Unzip the whole folder and run F1nancer.exe inside it\n"
            "2) Install WebView2 Runtime\n"
            "3) Right-click the zip → Properties → Unblock, then extract again",
            exc,
        )
