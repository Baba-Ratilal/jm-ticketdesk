# Registers TicketDesk to start automatically when the server boots, and restart if it crashes.
# Uses only built-in Windows Task Scheduler — nothing extra to install.
# Run in an ELEVATED PowerShell:   cd <app folder>;  .\deploy\install-task.ps1

$ErrorActionPreference = "Stop"
$appDir = (Resolve-Path "$PSScriptRoot\..").Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed (or not on PATH)." }
if (-not (Test-Path "$appDir\.next")) { throw "Run 'npm run build' first." }
if (-not (Test-Path "$appDir\.env.local")) { throw "Create .env.local first (copy .env.example)." }

$action   = New-ScheduledTaskAction -Execute "$appDir\deploy\start.cmd" -WorkingDirectory $appDir
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "TicketDesk" -Action $action -Trigger $trigger -Settings $settings `
    -User "SYSTEM" -RunLevel Highest -Force | Out-Null

Start-ScheduledTask -TaskName "TicketDesk"
Write-Host "TicketDesk registered and started. Logs: $appDir\logs\app.log"
Write-Host "Check:  Invoke-WebRequest http://127.0.0.1:3100/login -UseBasicParsing | Select StatusCode"
