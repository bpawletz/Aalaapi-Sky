# ==============================================================================
# record_features.ps1
# Automated Feature Video Recording Script for Aalaapi Sky (PowerShell / Windows)
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "Aalaapi Sky Automated Feature Video Recorder" -ForegroundColor Cyan
Write-Host "Using Default Rural Aalaapi Sky Location (41.3215, -88.9950)" -ForegroundColor DarkGray
Write-Host "=======================================================" -ForegroundColor Cyan

$Feature = $args[0]

if ($Feature) {
    if ($Feature -eq "--list" -or $Feature -eq "-l") {
        node tools/record_features.js --list
        exit 0
    }
    elseif ($Feature -eq "--help" -or $Feature -eq "-h") {
        node tools/record_features.js --help
        exit 0
    }
    elseif ($Feature -eq "all" -or $Feature -eq "--all") {
        node tools/record_features.js --all
    }
    else {
        Write-Host "Recording target feature: $Feature..." -ForegroundColor Yellow
        node tools/record_features.js "--feature=$Feature"
    }
}
else {
    Write-Host "Recording all major application features..." -ForegroundColor Yellow
    node tools/record_features.js --all
}

Write-Host ""
Write-Host "Video generation finished successfully!" -ForegroundColor Green
Write-Host "Output directory: recordings/ (*.webm)" -ForegroundColor Cyan
Write-Host "Git Hygiene: Video directory is strictly gitignored." -ForegroundColor DarkGray
