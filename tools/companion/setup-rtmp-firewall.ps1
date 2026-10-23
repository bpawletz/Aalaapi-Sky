# Aalaapi Sky - Windows Firewall RTMP Port Setup
# Configures inbound TCP port 1935 for direct DJI RC 2 / DJI Fly RTMP live streaming.

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Aalaapi Sky Companion - RTMP Ingest Firewall Setup     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[*] Target Port: TCP 1935 (Inbound RTMP Ingest)" -ForegroundColor DarkGray

if (-not (Test-IsAdmin)) {
    Write-Host "[!] Administrative elevation required to configure Windows Firewall." -ForegroundColor Yellow
    Write-Host "[*] Requesting UAC elevation..." -ForegroundColor Yellow
    
    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$scriptPath`""
    exit 0
}

$ruleName = "Aalaapi Sky RTMP Ingest"

try {
    Write-Host "[*] Checking existing firewall rules..." -ForegroundColor Cyan
    $existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
    if ($LASTEXITCODE -eq 0 -and $existing -match "1935") {
        Write-Host "[+] Firewall rule '$ruleName' is already active on port 1935!" -ForegroundColor Green
    } else {
        Write-Host "[*] Adding inbound firewall rule for TCP port 1935..." -ForegroundColor Cyan
        netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=1935 profile=any description="Allows inbound RTMP video streaming from DJI RC 2 to Aalaapi Sky Companion"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[+] Inbound firewall rule '$ruleName' successfully created!" -ForegroundColor Green
        } else {
            Write-Host "[!] Failed to add firewall rule. Error code: $LASTEXITCODE" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "[!] Exception while configuring firewall: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[+] Setup complete. DJI RC 2 can now stream to rtmp://<YOUR_PC_IP>:1935/live/stream" -ForegroundColor Cyan
Write-Host "You may now close this window." -ForegroundColor DarkGray
