# Use after copying new app files over the old ones.
# Run in an ELEVATED PowerShell from the app folder:   .\deploy\update.ps1

$ErrorActionPreference = "Stop"
$appDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $appDir

Stop-ScheduledTask -TaskName "TicketDesk" -ErrorAction SilentlyContinue
# make sure nothing is still listening on TicketDesk's port (3100)
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

npm ci
npm run build
Start-ScheduledTask -TaskName "TicketDesk"
Write-Host "Updated and restarted."
