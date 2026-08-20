# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for F1nancer.app (local Mac builds)."""

from pathlib import Path

from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH).resolve().parent
BACKEND_APP = ROOT / "backend" / "app"
FRONTEND_DIST = ROOT / "frontend" / "dist"

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
    "app.routers.transactions",
    "app.services",
    "app.services.recurring",
]

for package in ("webview", "uvicorn", "fastapi", "starlette", "anyio", "sqlalchemy", "pydantic"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

# Bundle the FastAPI package under app/
datas.append((str(BACKEND_APP), "app"))

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

app = BUNDLE(
    coll,
    name="F1nancer.app",
    icon=str(ROOT / "desktop" / "F1nancer.icns"),
    bundle_identifier="com.f1nancer.app",
    info_plist={
        "CFBundleName": "F1nancer",
        "CFBundleDisplayName": "F1nancer",
        "CFBundleShortVersionString": "0.1.0",
        "NSHighResolutionCapable": True,
    },
)
