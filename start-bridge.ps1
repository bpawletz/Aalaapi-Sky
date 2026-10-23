# Aalaapi Sky Bridge Companion Service Auto-Restart Runner
# Keeps the bridge running and cleanly respawns when remote restart is triggered (exit code 42).

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $scriptDir "tools\companion\server.js"
$env:AALAAPI_RESTART_LOOP = "1"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       Aalaapi Sky Companion Bridge (Auto-Restart Loop)   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[*] Script Directory: $scriptDir" -ForegroundColor DarkGray
Write-Host "[*] Loop Runner active (AALAAPI_RESTART_LOOP=1)" -ForegroundColor DarkGray

# Check Windows Firewall for RTMP Ingest (TCP 1935)
try {
    $fwCheck = netsh advfirewall firewall show rule name="Aalaapi Sky RTMP Ingest" 2>$null
    if ($fwCheck -match "1935") {
        Write-Host "[+] Windows Firewall: RTMP Ingest (TCP 1935) is OPEN." -ForegroundColor Green
    } else {
        Write-Host "[!] Windows Firewall: RTMP port 1935 rule not found." -ForegroundColor Yellow
        Write-Host "    To enable direct DJI RC 2 streaming, run: .\tools\companion\setup-rtmp-firewall.bat" -ForegroundColor Yellow
    }
} catch {}

do {
    Write-Host ""
    Write-Host "[*] Starting Aalaapi Sky Bridge companion service..." -ForegroundColor Cyan
    & node $serverPath
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 42) {
        Write-Host ""
        Write-Host "[*] Received remote restart request (exit code 42)." -ForegroundColor Yellow
        Write-Host "[*] Respawning Aalaapi Sky Bridge in 1 second..." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
} while ($exitCode -eq 42)

if ($exitCode -ne 0 -and $exitCode -ne 42) {
    Write-Host ""
    Write-Host "[!] Aalaapi Sky Bridge exited with error code $exitCode." -ForegroundColor Red
}
