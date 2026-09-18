<#
.SYNOPSIS
    Downloads and installs the dji-log CLI binary for Windows x64.
.DESCRIPTION
    Fetches the precompiled dji-log-x86_64-pc-windows-msvc.zip from GitHub releases (v0.5.7)
    and extracts dji-log.exe into tools/companion/bin/.
#>

[CmdletBinding()]
param(
    [string]$Version = "v0.5.7",
    [string]$TargetDir = "$PSScriptRoot\companion\bin"
)

$ErrorActionPreference = "Stop"

$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$exePath = Join-Path $TargetDir "dji-log.exe"
if (Test-Path $exePath) {
    Write-Host "[V] dji-log.exe already exists at: $exePath" -ForegroundColor Green
    & $exePath --version
    exit 0
}

$zipUrl = "https://github.com/lvauvillier/dji-log-parser/releases/download/$Version/dji-log-x86_64-pc-windows-msvc.zip"
$tempZip = Join-Path $env:TEMP "dji-log-$Version.zip"

Write-Host "Downloading dji-log $Version from $zipUrl..." -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing

Write-Host "Extracting to $TargetDir..." -ForegroundColor Cyan
Expand-Archive -Path $tempZip -DestinationPath $TargetDir -Force
Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

if (Test-Path $exePath) {
    Write-Host "[V] Successfully installed dji-log.exe!" -ForegroundColor Green
    & $exePath --version
} else {
    Write-Error "Failed to find dji-log.exe after extraction in $TargetDir"
}
