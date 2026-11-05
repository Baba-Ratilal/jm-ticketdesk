# Checks that the Microsoft ODBC driver and Windows authentication work, BEFORE starting the app.
# Run in an ELEVATED PowerShell:   cd <app folder>;  .\deploy\test-db.ps1
# It tests twice: as you, and as SYSTEM (the account the app runs under). Both should say OK.
# Changes nothing.

param(
    [string]$Driver = "ODBC Driver 18 for SQL Server",
    [string]$Server = "lpc:(local)",          # lpc: = shared memory (direct, local). For a named instance: lpc:(local)\SQLEXPRESS
    [string]$Database = "TicketDesk"
)

$cs = "Driver={$Driver};Server=$Server;Database=$Database;Trusted_Connection=Yes;Encrypt=No;TrustServerCertificate=Yes;"

$body = @"
`$cs  = '$cs'
`$out = `$args[0]
try {
  `$c = New-Object System.Data.Odbc.OdbcConnection(`$cs); `$c.Open()
  `$cmd = `$c.CreateCommand()
  `$cmd.CommandText = "SELECT SUSER_SNAME() + '  |  database ' + DB_NAME() + '  |  tables: ' + CAST((SELECT COUNT(*) FROM sys.tables) AS varchar(10))"
  ("OK   " + `$cmd.ExecuteScalar()) | Out-File `$out -Encoding utf8
  `$c.Close()
} catch { ("FAIL " + `$_.Exception.Message) | Out-File `$out -Encoding utf8 }
"@

$script = Join-Path $env:TEMP "td-dbtest.ps1"
Set-Content -Path $script -Value $body -Encoding UTF8

# 1) as the current user
$out1 = Join-Path $env:TEMP "td-dbtest-me.txt"
Remove-Item $out1 -ErrorAction SilentlyContinue
& powershell -NoProfile -ExecutionPolicy Bypass -File $script $out1
Write-Host "As you   : " -NoNewline; Get-Content $out1

# 2) as SYSTEM, through a one-off scheduled task
$sysDir = "C:\Windows\Temp"
Copy-Item $script "$sysDir\td-dbtest.ps1" -Force
$out2 = "$sysDir\td-dbtest-system.txt"
Remove-Item $out2 -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$sysDir\td-dbtest.ps1`" `"$out2`""
Register-ScheduledTask -TaskName "TicketDesk db test" -Action $action -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName "TicketDesk db test"
for ($i = 0; $i -lt 30 -and -not (Test-Path $out2); $i++) { Start-Sleep -Seconds 1 }
Unregister-ScheduledTask -TaskName "TicketDesk db test" -Confirm:$false
Write-Host "As SYSTEM: " -NoNewline
if (Test-Path $out2) { Get-Content $out2 } else { Write-Host "no answer after 30 seconds" }
Remove-Item $script, "$sysDir\td-dbtest.ps1", $out1, $out2 -ErrorAction SilentlyContinue
