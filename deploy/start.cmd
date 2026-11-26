@echo off
rem Starts TicketDesk. Run by the "TicketDesk" scheduled task (see install-task.ps1).
rem Listens on 127.0.0.1 only, so the only way in is through IIS.
cd /d "%~dp0.."
if not exist logs mkdir logs
set NODE_ENV=production
node node_modules\next\dist\bin\next start -H 0.0.0.0 -p 3000 >> logs\app.log 2>&1
