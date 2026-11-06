# Registers the daily to-do email: 9:00 AM, 2:00 PM and 4:00 PM, as SYSTEM.
# Run in an ELEVATED PowerShell after the MS_* lines in .env.local are filled in and the team's emails are saved on the Users page:
#   cd <app folder>;  .\deploy\install-digest-task.ps1
# Test first (sends nothing):  node --env-file=.env.local scripts\send-digest.js --dry

$ErrorActionPreference = "Stop"
$appDir = (Resolve-Path "$PSScriptRoot\..").Path
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path "$appDir\.env.local")) { throw "Create .env.local first." }
New-Item -ItemType Directory -Force "$appDir\logs" | Out-Null

$cmd = "/c cd /d `"$appDir`" && `"$node`" --env-file=.env.local scripts\send-digest.js >> logs\digest.log 2>&1"
$action   = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmd -WorkingDirectory $appDir
$triggers = @("9:00AM", "2:00PM", "4:00PM") | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName "TicketDesk digest" -Action $action -Trigger $triggers -Settings $settings `
    -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Write-Host "Registered: 'TicketDesk digest', daily at 9:00 AM, 2:00 PM and 4:00 PM. Log: $appDir\logs\digest.log"
Write-Host "Send one now to try:  Start-ScheduledTask -TaskName 'TicketDesk digest'"
