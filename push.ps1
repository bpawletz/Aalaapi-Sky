$ErrorActionPreference = "Stop"

Write-Host "🔨 Building single-file bundle..." -ForegroundColor Cyan
python scratch/build.py

Write-Host "🧪 Running unit tests..." -ForegroundColor Cyan
node --test index.test.js

Write-Host "📦 Staging git changes..." -ForegroundColor Cyan
git add .

$CommitMsg = $args[0]
if (-not $CommitMsg) {
    $CommitMsg = Read-Host -Prompt "Enter commit message"
}
if (-not $CommitMsg) {
    $CommitMsg = "update codebase"
}

Write-Host "💾 Committing changes..." -ForegroundColor Cyan
git commit -m "$CommitMsg"

Write-Host "🚀 Pushing to remote repository..." -ForegroundColor Cyan
git push

Write-Host "✅ Successfully built, tested, committed, and pushed!" -ForegroundColor Green
