# Wait for the running F1nancer process to exit, then silently run Setup.exe and relaunch.
param(
  [Parameter(Mandatory = $true)][string]$AppSrc,
  [Parameter(Mandatory = $true)][int]$WaitPid,
  [Parameter(Mandatory = $true)][string]$AppDest
)

$ErrorActionPreference = "Stop"
$LogDir = Join-Path $env:LOCALAPPDATA "F1nancer"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir "apply_update.log"

function Write-Log([string]$Message) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $Log -Value "$ts $Message"
}

Write-Log "apply_update start src=$AppSrc pid=$WaitPid dest=$AppDest"

if (-not (Test-Path -LiteralPath $AppSrc)) {
  Write-Log "Missing installer: $AppSrc"
  exit 1
}

for ($i = 0; $i -lt 240; $i++) {
  $proc = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue
  if (-not $proc) { break }
  Start-Sleep -Milliseconds 500
}

$proc = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue
if ($proc) {
  Write-Log "Process $WaitPid still alive; sending CloseMainWindow/Kill"
  try { $proc.CloseMainWindow() | Out-Null } catch {}
  Start-Sleep -Seconds 2
  $proc = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Id $WaitPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
}

Start-Sleep -Seconds 1

$parent = Split-Path -Parent $AppDest
New-Item -ItemType Directory -Force -Path $parent | Out-Null

$setupArgs = @(
  "/VERYSILENT",
  "/NORESTART",
  "/SUPPRESSMSGBOXES",
  "/CLOSEAPPLICATIONS",
  "/DIR=`"$AppDest`""
)
Write-Log "Running installer $AppSrc $($setupArgs -join ' ')"
$installer = Start-Process -FilePath $AppSrc -ArgumentList $setupArgs -Wait -PassThru
if ($installer.ExitCode -ne 0) {
  Write-Log "Installer failed with exit code $($installer.ExitCode)"
  exit $installer.ExitCode
}

$newExe = Join-Path $AppDest "F1nancer.exe"
if (-not (Test-Path -LiteralPath $newExe)) {
  Write-Log "Installer finished but exe missing: $newExe"
  exit 1
}

Start-Process -FilePath $newExe
Write-Log "apply_update done"
