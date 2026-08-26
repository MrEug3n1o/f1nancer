# Build F1nancer Windows onedir + optional zip for sharing.
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$InstallZip = if ($env:MAKE_ZIP) { $env:MAKE_ZIP } else { "1" }

if (-not (Test-Path "frontend\node_modules")) {
  Write-Host "Installing frontend dependencies..."
  Push-Location frontend
  npm install
  Pop-Location
}

Write-Host "Building frontend..."
Push-Location frontend
npm run build
Pop-Location

$Python = "python"
if (Test-Path "backend\.venv\Scripts\python.exe") {
  $Python = (Resolve-Path "backend\.venv\Scripts\python.exe").Path
} elseif (Test-Path ".venv\Scripts\python.exe") {
  $Python = (Resolve-Path ".venv\Scripts\python.exe").Path
}

Write-Host "Using Python: $Python"
& $Python -m pip install -r backend\requirements.txt -r desktop\requirements.txt

$Revision = "unknown"
try {
  $Revision = (git -C $Root rev-parse HEAD).Trim()
} catch {}
Set-Content -Path "desktop\installed_revision.txt" -Value $Revision -NoNewline
Write-Host "Revision: $Revision"

Write-Host "Packaging F1nancer..."
& $Python -m PyInstaller desktop\f1nancer.spec --noconfirm --distpath desktop\dist --workpath desktop\build

$DistDir = Join-Path $Root "desktop\dist\F1nancer"
if (-not (Test-Path (Join-Path $DistDir "F1nancer.exe"))) {
  throw "Build finished but F1nancer.exe is missing under desktop\dist\F1nancer"
}

Copy-Item "desktop\installed_revision.txt" (Join-Path $DistDir "installed_revision.txt") -Force

$Version = "0.0.0"
Get-Content "backend\app\version.py" | ForEach-Object {
  if ($_ -match 'APP_VERSION\s*=\s*"([^"]+)"') { $Version = $Matches[1] }
}

Write-Host ""
Write-Host "Done: $DistDir"

if ($InstallZip -eq "1") {
  $ZipPath = Join-Path $Root "desktop\dist\F1nancer-$Version-windows.zip"
  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
  Compress-Archive -Path $DistDir -DestinationPath $ZipPath
  Write-Host "Zip ready: $ZipPath"
  Write-Host "Send this zip to another Windows PC — unzip and run F1nancer.exe"
} else {
  Write-Host "Skip zip (MAKE_ZIP=0). Run: desktop\dist\F1nancer\F1nancer.exe"
}

Write-Host "Requires Microsoft Edge WebView2 Runtime (usually preinstalled on Windows 10/11)."
