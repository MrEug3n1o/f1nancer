"""Launch F1nancer as a native desktop window (macOS / Windows)."""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path


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
        raise SystemExit(
            f"Frontend build not found at {static_dir}.\n"
            "Run: cd frontend && npm run build"
        )

    os.environ.setdefault("F1NANCER_STATIC_DIR", str(static_dir))
    os.environ.setdefault("F1NANCER_DESKTOP", "1")


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_server(url: str, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    health = f"{url}/health"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(health, timeout=0.5) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(0.05)
    raise SystemExit(f"Server did not become ready at {health}")


def main() -> None:
    root = _project_root()
    _prepare_environment(root)

    import uvicorn
    import webview

    port = _free_port()
    host = "127.0.0.1"
    url = f"http://{host}:{port}"

    config = uvicorn.Config(
        "app.main:app",
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    try:
        _wait_for_server(url)
        webview.create_window("F1nancer", url, width=1280, height=840, min_size=(900, 600))
        webview.start()
    finally:
        server.should_exit = True
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
