param(
    [Parameter(Position=0)]
    [string]$CommitMsg = "",
    [switch]$Quick,
    [switch]$Full
)

$ErrorActionPreference = "Stop"

# Handle optional flags passed as positional strings
if ($CommitMsg -eq "--quick" -or $CommitMsg -eq "-quick") {
    $Quick = $true
    $CommitMsg = ""
} elseif ($CommitMsg -eq "--full" -or $CommitMsg -eq "-full") {
    $Full = $true
    $CommitMsg = ""
}

if ($Quick) {
    Write-Host 'Quick Mode: Building bundle and verifying module graph...' -ForegroundColor Cyan
    python scratch/build.py
    node tools/build/check_modules.js
} elseif ($Full) {
    Write-Host 'Full Mode: Building single-file bundle...' -ForegroundColor Cyan
    python scratch/build.py

    Write-Host 'Verifying static AST module graph...' -ForegroundColor Cyan
    node tools/build/check_modules.js

    Write-Host 'Running full unit and companion test suites...' -ForegroundColor Cyan
    npm run test:unit

    Write-Host 'Running Playwright E2E UI test suite...' -ForegroundColor Cyan
    npm run test:e2e

    Write-Host 'Running strict DJI WPML 1.0.2 XSD schema validation...' -ForegroundColor Cyan
    python tools/validation/validate_wpml.py --run-matrix
} else {
    Write-Host 'Building single-file bundle...' -ForegroundColor Cyan
    python scratch/build.py

    Write-Host 'Verifying static AST module graph...' -ForegroundColor Cyan
    node tools/build/check_modules.js

    Write-Host 'Running unit and companion tests...' -ForegroundColor Cyan
    npm run test:unit
}

Write-Host 'Staging git changes...' -ForegroundColor Cyan
git add .

if (-not $CommitMsg) {
    $CommitMsg = Read-Host -Prompt "Enter commit message"
}
if (-not $CommitMsg) {
    $CommitMsg = "update codebase"
}

Write-Host "Committing changes..." -ForegroundColor Cyan
git commit -m "$CommitMsg"

Write-Host "Pushing to remote repository..." -ForegroundColor Cyan
git push

Write-Host "Successfully built, tested, committed, and pushed!" -ForegroundColor Green
