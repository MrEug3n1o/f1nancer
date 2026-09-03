# Verify a Windows PyInstaller onedir contains pywebview/.NET native runtime pieces.
# Fails the build if anything critical is missing (silent hang at launch otherwise).
param(
  [Parameter(Mandatory = $true)][string]$DistDir
)

$ErrorActionPreference = "Stop"

function Test-BundleName([string]$Label, [string]$Pattern) {
  $found = Get-ChildItem -Path $DistDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like $Pattern }
  if ($found) {
    Write-Host "  ok $Label"
    return $true
  }
  Write-Host "  MISSING $Label ($Pattern)"
  return $false
}

Write-Host "Verifying Windows bundle at $DistDir"

$exe = Join-Path $DistDir "F1nancer.exe"
if (-not (Test-Path $exe)) {
  throw "Missing F1nancer.exe in $DistDir"
}

$ok = $true
$ok = (Test-BundleName "Python.Runtime.dll" "Python.Runtime.dll") -and $ok
$ok = (Test-BundleName "ClrLoader.dll" "ClrLoader.dll") -and $ok
$ok = (Test-BundleName "WebView2Loader.dll" "WebView2Loader.dll") -and $ok
$ok = (Test-BundleName "frontend index.html" "index.html") -and $ok

if (-not $ok) {
  throw @"
Windows bundle is missing native components required for pywebview.
The app would hang or exit silently on user PCs.
Rebuild after updating desktop/f1nancer.spec (pythonnet/clr_loader collection).
"@
}

Write-Host "Windows bundle verification passed."
