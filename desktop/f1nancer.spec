# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for F1nancer (macOS .app and Windows onedir)."""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH).resolve().parent
BACKEND_APP = ROOT / "backend" / "app"
FRONTEND_DIST = ROOT / "frontend" / "dist"
IS_DARWIN = sys.platform == "darwin"
IS_WINDOWS = sys.platform == "win32"

if not FRONTEND_DIST.is_dir():
    raise SystemExit(
        f"Missing {FRONTEND_DIST}. Build the frontend first: cd frontend && npm run build"
    )

datas = [
    (str(FRONTEND_DIST), "frontend/dist"),
]
binaries = []
hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "app",
    "app.main",
    "app.database",
    "app.models",
    "app.schemas",
    "app.seed",
    "app.routers",
    "app.routers.analytics",
    "app.routers.budgets",
    "app.routers.categories",
    "app.routers.goals",
    "app.routers.recurring",
    "app.routers.settings",
    "app.routers.system",
    "app.routers.transactions",
    "app.routers.currencies",
    "app.routers.deposits",
    "app.services",
    "app.services.recurring",
    "app.update_service",
    "app.version",
    "app.deposit_utils",
    "app.currency_utils",
    "app.schema_upgrade",
]

if IS_DARWIN:
    datas.append((str(ROOT / "desktop" / "apply_update.sh"), "desktop"))
elif IS_WINDOWS:
    datas.append((str(ROOT / "desktop" / "apply_update.ps1"), "desktop"))

revision = ROOT / "desktop" / "installed_revision.txt"
if revision.is_file():
    datas.append((str(revision), "."))

for package in ("webview", "uvicorn", "fastapi", "starlette", "anyio", "sqlalchemy", "pydantic"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

# Bundle the FastAPI package under app/
datas.append((str(BACKEND_APP), "app"))

icon = None
if IS_DARWIN:
    icon = str(ROOT / "desktop" / "F1nancer.icns")
elif IS_WINDOWS and (ROOT / "desktop" / "F1nancer.ico").is_file():
    icon = str(ROOT / "desktop" / "F1nancer.ico")

a = Analysis(
    [str(ROOT / "desktop" / "run.py")],
    pathex=[str(ROOT / "backend")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="F1nancer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="F1nancer",
)

# Keep CFBundleShortVersionString in sync with app.version.APP_VERSION
_version = "0.1.0"
_version_file = BACKEND_APP / "version.py"
if _version_file.is_file():
    for _line in _version_file.read_text(encoding="utf-8").splitlines():
        if _line.startswith("APP_VERSION"):
            _version = _line.split("=", 1)[1].strip().strip("\"'")
            break

if IS_DARWIN:
    app = BUNDLE(
        coll,
        name="F1nancer.app",
        icon=icon,
        bundle_identifier="com.f1nancer.app",
        info_plist={
            "CFBundleName": "F1nancer",
            "CFBundleDisplayName": "F1nancer",
            "CFBundleShortVersionString": _version,
            "NSHighResolutionCapable": True,
        },
    )
