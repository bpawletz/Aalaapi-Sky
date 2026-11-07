<#
.SYNOPSIS
    Aalaapi Sky - Automated Android APK Push & Install Script
.DESCRIPTION
    Auto-detects ADB, finds the latest APK build or downloaded artifact,
    installs it directly to the connected Android device (keeping user data),
    and launches Aalaapi Sky.
.EXAMPLE
    .\push-apk.ps1
    .\push-apk.ps1 -ApkPath "C:\path\to\app-debug.apk"
    .\push-apk.ps1 -DeviceId "R52WB001SXW"
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string]$ApkPath,

    [Parameter(Mandatory = $false)]
    [string]$DeviceId
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsTool = Join-Path $scriptDir "tools\android\push_apk.js"

$nodeArgs = @($jsTool)
if ($DeviceId) {
    $nodeArgs += @("--device", $DeviceId)
}
if ($ApkPath) {
    $nodeArgs += @($ApkPath)
}

& node @nodeArgs
exit $LASTEXITCODE
