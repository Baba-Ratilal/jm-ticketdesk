# Registers the nightly ERP user sync: every day at 12:00 AM (midnight), as SYSTEM.
# Run in an ELEVATED PowerShell after deploy\erp-sync.sql and the ERP_* lines in .env.local are ready:
#   cd <app folder>;  .\deploy\install-sync-task.ps1
# Test first (changes nothing):  node --env-file=.env.local scripts\erp-sync.js --dry

$ErrorActionPreference = "Stop"
$appDir = (Resolve-Path "$PSScriptRoot\..").Path
$node = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path "$appDir\.env.local")) { throw "Create .env.local first." }
if (-not (Test-Path "$appDir\deploy\erp-sync.sql")) { throw "Create deploy\erp-sync.sql first (copy erp-sync.sample.sql and adapt it)." }
New-Item -ItemType Directory -Force "$appDir\logs" | Out-Null

$cmd = "/c cd /d `"$appDir`" && `"$node`" --env-file=.env.local scripts\erp-sync.js >> logs\erp-sync.log 2>&1"
$action   = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmd -WorkingDirectory $appDir
$trigger  = New-ScheduledTaskTrigger -Daily -At "12:00AM"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName "TicketDesk ERP sync" -Action $action -Trigger $trigger -Settings $settings `
    -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Write-Host "Registered: 'TicketDesk ERP sync', daily at 12:00 AM. Log: $appDir\logs\erp-sync.log"
Write-Host "Run it now to try:  Start-ScheduledTask -TaskName 'TicketDesk ERP sync'"
