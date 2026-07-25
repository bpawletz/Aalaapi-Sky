#!/usr/bin/env bash
set -e

echo "🔨 Building single-file bundle..."
python scratch/build.py

echo "🧪 Running unit & E2E tests..."
node --test index.test.js index.e2e.test.js

echo "📦 Staging git changes..."
git add .

COMMIT_MSG="$1"
if [ -z "$COMMIT_MSG" ]; then
    echo -n "Enter commit message: "
    read -r COMMIT_MSG
fi

if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="update codebase"
fi

echo "💾 Committing changes..."
git commit -m "$COMMIT_MSG"

echo "🚀 Pushing to remote repository..."
git push

echo "✅ Successfully built, tested, committed, and pushed!"
