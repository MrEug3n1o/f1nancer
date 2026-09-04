# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for F1nancer (macOS .app and Windows onedir)."""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_dynamic_libs

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
    "h11",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
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
    "app.iso_currencies",
    "app.schema_upgrade",
]

def _collect_optional(package: str) -> None:
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: collect_all({package!r}) failed: {exc}")
        return
    datas.extend(pkg_datas)
    binaries.extend(pkg_binaries)
    hiddenimports.extend(pkg_hidden)


def _bundle_windows_native() -> None:
    """Copy pythonnet / WebView2 DLLs that PyInstaller often misses."""
    wanted = ("Python.Runtime.dll", "ClrLoader.dll", "WebView2Loader.dll")
    roots: list[Path] = []
    for mod_name in ("webview", "clr_loader", "pythonnet"):
        try:
            mod = __import__(mod_name)
        except ImportError:
            continue
        path = getattr(mod, "__file__", None)
        if path:
            roots.append(Path(path).resolve().parent)
        for entry in getattr(mod, "__path__", []):
            roots.append(Path(entry))
    try:
        import site

        roots.extend(Path(p) for p in site.getsitepackages())
        user_site = site.getusersitepackages()
        if user_site:
            roots.append(Path(user_site))
    except Exception:
        pass

    candidates: dict[str, list[Path]] = {name: [] for name in wanted}
    seen: set[str] = set()
    for root in roots:
        if not root.is_dir():
            continue
        for name in wanted:
            for item in root.rglob(name):
                if not item.is_file():
                    continue
                key = str(item.resolve()).lower()
                if key in seen:
                    continue
                seen.add(key)
                candidates[name].append(item)

    def _score(path: Path) -> int:
        text = str(path).lower()
        score = 0
        if "x64" in text or "amd64" in text or "win-x64" in text:
            score += 3
        if "arm64" in text or "win-arm64" in text:
            score -= 2
        if "x86" in text or "win-x86" in text:
            score -= 1
        return score

    for name, paths in candidates.items():
        if not paths:
            print(f"WARNING: {name} not found in site-packages")
            continue
        chosen = max(paths, key=_score)
        binaries.append((str(chosen), "."))
        print(f"INFO: bundling {name} from {chosen}")
        for extra in paths:
            if extra == chosen:
                continue
            dest = extra.parent.name if extra.parent.name not in {".", ""} else "."
            binaries.append((str(extra), dest))


if IS_DARWIN:
    datas.append((str(ROOT / "desktop" / "apply_update.sh"), "desktop"))
elif IS_WINDOWS:
    datas.append((str(ROOT / "desktop" / "apply_update.ps1"), "desktop"))
    hiddenimports += [
        "clr",
        "clr_loader",
        "clr_loader.ffi",
        "clr_loader.netfx",
        "pythonnet",
        "webview.platforms.winforms",
        "webview.platforms.edgechromium",
    ]
    for package in ("clr_loader", "pythonnet", "clr"):
        _collect_optional(package)
    try:
        import webview

        webview_root = Path(webview.__file__).resolve().parent
        lib_dir = webview_root / "lib"
        if lib_dir.is_dir():
            for item in lib_dir.rglob("*"):
                if item.is_file():
                    rel_parent = item.parent.relative_to(webview_root)
                    datas.append((str(item), str(Path("webview") / rel_parent)))
        datas += collect_data_files("webview")
        binaries += collect_dynamic_libs("webview")
    except ImportError:
        pass
    _bundle_windows_native()

revision = ROOT / "desktop" / "installed_revision.txt"
if revision.is_file():
    datas.append((str(revision), "."))

for package in ("webview", "uvicorn", "fastapi", "starlette", "anyio", "sqlalchemy", "pydantic", "h11"):
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

# UPX can break Windows .NET / WebView2 native shims.
use_upx = not IS_WINDOWS

a = Analysis(
    [str(ROOT / "desktop" / "run.py")],
    pathex=[str(ROOT / "backend")],
    binaries=binaries,
    datas=datas,
    hiddenimports=list(dict.fromkeys(hiddenimports)),
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
    upx=use_upx,
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
    upx=use_upx,
    upx_exclude=[],
    name="F1nancer",
)

# Keep CFBundleShortVersionString in sync with app.version.APP_VERSION
_version = "0.1.1"
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
