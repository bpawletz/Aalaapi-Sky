#!/usr/bin/env bash
set -e

QUICK=false
FULL=false
COMMIT_MSG=""

for arg in "$@"; do
    case "$arg" in
        --quick|-quick)
            QUICK=true
            ;;
        --full|-full)
            FULL=true
            ;;
        *)
            if [ -z "$COMMIT_MSG" ]; then
                COMMIT_MSG="$arg"
            fi
            ;;
    esac
done

if [ "$QUICK" = true ]; then
    echo "⚡ Quick Mode: Building bundle and verifying module graph..."
    python scratch/build.py
    node tools/build/check_modules.js
elif [ "$FULL" = true ]; then
    echo "🔨 Full Mode: Building single-file bundle..."
    python scratch/build.py

    echo "🔍 Verifying static AST module graph..."
    node tools/build/check_modules.js

    echo "🧪 Running full unit & companion test suites..."
    npm run test:unit

    echo "🎭 Running Playwright E2E UI test suite..."
    npm run test:e2e

    echo "📐 Running strict DJI WPML 1.0.2 XSD schema validation..."
    python tools/validation/validate_wpml.py --run-matrix
else
    echo "🔨 Building single-file bundle..."
    python scratch/build.py

    echo "🔍 Verifying static AST module graph..."
    node tools/build/check_modules.js

    echo "🧪 Running unit & companion tests..."
    npm run test:unit
fi

echo "📦 Staging git changes..."
git add .

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
