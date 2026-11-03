# Updates the app from Git, rebuilds and restarts it. Your data (database, screenshots, .env.local) is never touched.
# Run in an ELEVATED PowerShell from the app folder:
#   .\deploy\update.ps1                 -> latest version
#   .\deploy\update.ps1 -Version abc123 -> a specific version (use this to go back)
param([string]$Version = "")

$ErrorActionPreference = "Stop"
$appDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $appDir

if (-not (Test-Path "$appDir\.git")) {
    Write-Host "This folder is not a Git checkout. See 'Updating later' in SETUP-ONPREM.md (clone the repository first)." -ForegroundColor Red
    exit 1
}
if (git status --porcelain --untracked-files=no) {
    Write-Host "Files in this folder were edited by hand. Undo or commit them first (git status shows which)." -ForegroundColor Red
    exit 1
}

function Build-And-Start {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
    Start-ScheduledTask -TaskName "TicketDesk"
}

$old = (git rev-parse HEAD).Trim()

Stop-ScheduledTask -TaskName "TicketDesk" -ErrorAction SilentlyContinue
# make sure nothing is still listening on TicketDesk's port (3100)
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

try {
    git fetch --all --tags
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed (check the network and the deploy key)" }
    if ($Version) { git checkout --detach $Version } else { git checkout main; git pull --ff-only }
    if ($LASTEXITCODE -ne 0) { throw "could not get that version" }
    $new = (git rev-parse HEAD).Trim()

    # database changes that came with this update
    $sql = git diff --name-only $old $new -- "deploy/upgrade-*.sql"
    Build-And-Start
    Write-Host "Updated $($old.Substring(0,7)) -> $($new.Substring(0,7)) and restarted." -ForegroundColor Green
    if ($sql) {
        Write-Host "`nThis update includes database changes. Run these ONCE in SSMS on the TicketDesk database:" -ForegroundColor Yellow
        $sql | ForEach-Object { Write-Host "  $_" }
    }
}
catch {
    Write-Host "Update failed: $_" -ForegroundColor Red
    Write-Host "Going back to the previous version $($old.Substring(0,7)) ..." -ForegroundColor Yellow
    git checkout --detach $old
    Build-And-Start
    Write-Host "The previous version is running again." -ForegroundColor Yellow
    exit 1
}
