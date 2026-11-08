<#
.SYNOPSIS
    Aalaapi Sky & Comms - Automated Android APK Push & Install Script
.DESCRIPTION
    Auto-detects ADB, finds the latest APK builds for Aalaapi Sky and Aalaapi Comms,
    installs them directly to the connected Android device (keeping user data),
    and launches the selected app.
.EXAMPLE
    .\push-apk.ps1                # Auto-installs both Sky and Comms if available, launches Sky
    .\push-apk.ps1 -Comms         # Installs and launches Aalaapi Comms
    .\push-apk.ps1 -Sky           # Installs and launches Aalaapi Sky
    .\push-apk.ps1 -All           # Installs both Sky and Comms
    .\push-apk.ps1 -ApkPath "C:\path\to\app-debug.apk"
    .\push-apk.ps1 -DeviceId "R52WB001SXW"
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string]$ApkPath,

    [Parameter(Mandatory = $false)]
    [string]$DeviceId,

    [switch]$Comms,
    [switch]$Sky,
    [switch]$All
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsTool = Join-Path $scriptDir "tools\android\push_apk.js"

$nodeArgs = @($jsTool)
if ($DeviceId) {
    $nodeArgs += @("--device", $DeviceId)
}
if ($Comms) {
    $nodeArgs += @("--comms")
} elseif ($Sky) {
    $nodeArgs += @("--sky")
} elseif ($All) {
    $nodeArgs += @("--all")
}

if ($ApkPath) {
    $nodeArgs += @($ApkPath)
}

& node @nodeArgs
exit $LASTEXITCODE
